# Simo one-click launcher (Windows PowerShell 5.1+ / PowerShell 7)
#
# What it does:
#   - resolves simo.exe next to this script (or in .\backend\, .\bin\)
#   - single-instance lock per data directory (state file + exclusive file lock)
#   - port-in-use detection (distinguishes an existing Simo from another program)
#   - starts the server, then polls /api/health until ready
#   - on failure: stops only the process it started, prints the log tail, exits non-zero
#   - writes logs to <DataDir>\logs\ and an instance state file <DataDir>\.simo-instance.json
#   - -Stop stops only the instance recorded in this data directory (never kills unrelated agents)
#
# Usage:
#   .\start.ps1                          # real model, data in .\data, http://127.0.0.1:8787
#   .\start.ps1 -Model mock              # offline mock mode
#   .\start.ps1 -Listen 127.0.0.1:18917 -DataDir C:\Temp\simodata -Background
#   .\start.ps1 -Stop -DataDir C:\Temp\simodata
#   .\start.ps1 -OpenBrowser
#
# Exit codes: 0 ok / 1 start or health failure / 2 already running / 3 port conflict / 4 bad args
# NOTE: keep this file ASCII-only (Windows PowerShell 5.1 misreads UTF-8 without BOM).

param(
  [string]$Listen = '127.0.0.1:8787',
  [ValidateSet('real', 'mock')]
  [string]$Model = 'real',
  [string]$DataDir = '',
  [string]$Exe = '',
  [switch]$Background,
  [switch]$Stop,
  [switch]$OpenBrowser,
  [int]$HealthTimeoutSec = 60,
  [string]$LogDir = ''
)

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $DataDir) { $DataDir = Join-Path $root 'data' }
$DataDir = [System.IO.Path]::GetFullPath($DataDir)
$statePath = Join-Path $DataDir '.simo-instance.json'
$lockPath = Join-Path $DataDir '.start.lock'
if (-not $LogDir) { $LogDir = Join-Path $DataDir 'logs' }
$LogDir = [System.IO.Path]::GetFullPath($LogDir)

function Resolve-SimoExe {
  param([string]$Path)
  if ($Path) {
    if (Test-Path $Path) { return [System.IO.Path]::GetFullPath($Path) }
    throw "simo.exe not found: $Path"
  }
  foreach ($candidate in @(
      (Join-Path $root 'simo.exe'),
      (Join-Path $root 'backend\simo.exe'),
      (Join-Path $root 'bin\simo.exe')
    )) {
    if (Test-Path $candidate) { return [System.IO.Path]::GetFullPath($candidate) }
  }
  throw "simo.exe not found next to start.ps1 (looked: .\simo.exe, .\backend\simo.exe, .\bin\simo.exe). Pass -Exe <path>."
}

function Get-ListenHostPort {
  param([string]$Addr)
  if ($Addr -match '^\[(.+)\]:(\d+)$') { return @{ Host = $Matches[1]; Port = [int]$Matches[2] } }
  if ($Addr -match '^([^:]+):(\d+)$') { return @{ Host = $Matches[1]; Port = [int]$Matches[2] } }
  throw "invalid -Listen '$Addr' (expected host:port, e.g. 127.0.0.1:8787)"
}

function Test-SimoHealth {
  param([string]$HostName, [int]$Port, [int]$TimeoutSec = 2)
  $probeHost = if ($HostName -eq '0.0.0.0' -or $HostName -eq '::') { '127.0.0.1' } else { $HostName }
  try {
    $resp = Invoke-WebRequest -Uri ("http://" + $probeHost + ":" + $Port + "/api/health") -UseBasicParsing -TimeoutSec $TimeoutSec
    if ($resp.StatusCode -eq 200) { return $true }
  } catch { }
  return $false
}

function Get-PortOwnerPid {
  param([int]$Port)
  try {
    $conn = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction Stop | Select-Object -First 1
    if ($conn) { return [int]$conn.OwningProcess }
  } catch { }
  return 0
}

function Read-StateFile {
  if (-not (Test-Path $statePath)) { return $null }
  try { return (Get-Content $statePath -Raw | ConvertFrom-Json) } catch { return $null }
}

# ---------------------------------------------------------------- -Stop
if ($Stop) {
  $state = Read-StateFile
  if (-not $state) {
    Write-Host "[start] no recorded instance for data dir: $DataDir"
    exit 0
  }
  $proc = Get-Process -Id ([int]$state.pid) -ErrorAction SilentlyContinue
  if (-not $proc) {
    Write-Host "[start] recorded process $($state.pid) is not running; state file kept at $statePath"
    exit 0
  }
  $procPath = ''
  try { $procPath = [System.IO.Path]::GetFullPath($proc.Path) } catch { $procPath = '' }
  $recordedExe = [System.IO.Path]::GetFullPath([string]$state.exe)
  if ($procPath -and $recordedExe -and ($procPath -ne $recordedExe)) {
    Write-Host "[start] refusing to stop pid $($state.pid): exe path mismatch"
    Write-Host "        recorded: $recordedExe"
    Write-Host "        actual:   $procPath"
    exit 4
  }
  Write-Host "[start] stopping pid $($state.pid) ..."
  Stop-Process -Id ([int]$state.pid) -Force
  $deadline = (Get-Date).AddSeconds(15)
  while ((Get-Date) -lt $deadline) {
    if (-not (Get-Process -Id ([int]$state.pid) -ErrorAction SilentlyContinue)) { break }
    Start-Sleep -Milliseconds 200
  }
  Write-Host "[start] stopped."
  exit 0
}

# ---------------------------------------------------------------- resolve + validate
try {
  $exePath = Resolve-SimoExe -Path $Exe
  $hp = Get-ListenHostPort -Addr $Listen
} catch {
  Write-Host ("[start] " + $_.Exception.Message)
  exit 4
}
$listenHost = $hp.Host
$port = $hp.Port

New-Item -ItemType Directory -Force -Path $DataDir, $LogDir | Out-Null

# already-running guard: state file points at a live process
$existing = Read-StateFile
if ($existing) {
  $oldPid = 0
  [void][int]::TryParse([string]$existing.pid, [ref]$oldPid)
  if ($oldPid -gt 0 -and (Get-Process -Id $oldPid -ErrorAction SilentlyContinue)) {
    Write-Host "[start] Simo already running for this data dir: pid=$oldPid listen=$($existing.listen)"
    Write-Host "        stop it with: .\start.ps1 -Stop -DataDir `"$DataDir`""
    exit 2
  }
}

# single-instance lock (exclusive file handle; released automatically if this script exits)
try {
  $lockStream = [System.IO.File]::Open($lockPath, [System.IO.FileMode]::OpenOrCreate, [System.IO.FileAccess]::ReadWrite, [System.IO.FileShare]::None)
} catch {
  Write-Host "[start] another start.ps1 is already working on this data dir (lock file: $lockPath)"
  exit 2
}

# port-in-use detection
$ownerPid = Get-PortOwnerPid -Port $port
if ($ownerPid -ne 0) {
  if (Test-SimoHealth -HostName $listenHost -Port $port) {
    Write-Host "[start] port $port is already serving a Simo instance (pid=$ownerPid); not starting a second one."
  } else {
    Write-Host "[start] port $port is in use by another program (pid=$ownerPid); choose -Listen host:port"
  }
  if ($lockStream) { $lockStream.Dispose() }
  exit 3
}

# ---------------------------------------------------------------- start
$stamp = (Get-Date).ToString('yyyyMMdd-HHmmss')
$outLog = Join-Path $LogDir ("simo-" + $stamp + ".out.log")
$errLog = Join-Path $LogDir ("simo-" + $stamp + ".err.log")

$env:SIMO_HOME = $DataDir
if ($Model -eq 'mock') { $env:SIMO_MODEL = 'mock'; $env:SIMO_LLM = 'mock' } else { $env:SIMO_MODEL = 'real' }

Write-Host "[start] Simo"
Write-Host "        exe:   $exePath"
Write-Host "        data:  $DataDir"
Write-Host "        model: $Model"
Write-Host "        url:   http://${listenHost}:$port"
Write-Host "        logs:  $LogDir"

$argList = @('serve', '-addr', $Listen, '-model', $Model)
$proc = Start-Process -FilePath $exePath -ArgumentList $argList -WorkingDirectory $DataDir `
  -RedirectStandardOutput $outLog -RedirectStandardError $errLog -WindowStyle Hidden -PassThru

$state = [ordered]@{
  pid = $proc.Id; exe = $exePath; listen = $Listen; dataDir = $DataDir; model = $Model
  startedAt = (Get-Date).ToString('o'); stdoutLog = $outLog; stderrLog = $errLog
} | ConvertTo-Json -Depth 3
Set-Content -Path $statePath -Value $state -Encoding UTF8

# health check
$ready = $false
$deadline = (Get-Date).AddSeconds([Math]::Max(5, $HealthTimeoutSec))
while ((Get-Date) -lt $deadline) {
  if ($proc.HasExited) { break }
  if (Test-SimoHealth -HostName $listenHost -Port $port) { $ready = $true; break }
  Start-Sleep -Milliseconds 300
}

if (-not $ready) {
  Write-Host "[start] health check failed (http://${listenHost}:$port/api/health)"
  if (-not $proc.HasExited) {
    Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
    Start-Sleep -Milliseconds 500
  }
  foreach ($f in @($errLog, $outLog)) {
    if (Test-Path $f) {
      $tail = (Get-Content $f -Tail 20 -ErrorAction SilentlyContinue) -join [Environment]::NewLine
      if ($tail) { Write-Host ("--- " + (Split-Path -Leaf $f) + " (tail) ---"); Write-Host $tail }
    }
  }
  if ($proc.HasExited) { Write-Host "[start] process exited with code $($proc.ExitCode)" }
  if ($lockStream) { $lockStream.Dispose() }
  exit 1
}

Write-Host "[start] ready: http://${listenHost}:$port  (pid=$($proc.Id))"
if ($OpenBrowser) { Start-Process ("http://" + $listenHost + ":" + $port) | Out-Null }

if ($Background) {
  Write-Host "[start] running in background; stop with: .\start.ps1 -Stop -DataDir `"$DataDir`""
  if ($lockStream) { $lockStream.Dispose() }
  exit 0
}

# foreground: wait for the server; Ctrl+C stops this script and the child
try {
  Write-Host "[start] Ctrl+C to stop."
  $proc.WaitForExit()
  exit $proc.ExitCode
} finally {
  if (-not $proc.HasExited) { Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue }
  if ($lockStream) { try { $lockStream.Dispose() } catch { } }
}

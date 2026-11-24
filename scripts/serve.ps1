# serve.ps1 - start or stop the local Simo backend used as the agent workspace test server.
#
#   .\scripts\serve.ps1                 # start on 127.0.0.1:8787, fixed SIMO_HOME, wait for /api/health
#   .\scripts\serve.ps1 -Stop           # stop the instance recorded in .tmp\serve\pid.txt
#   .\scripts\serve.ps1 -Port 8788 -SimoHome <dir>   # isolated self-test instance
#
# Defaults: SIMO_HOME=E:\dsh_home\workspaces\agent\data, exe=backend\simo-8787-final10.exe.
# Files: .tmp\serve\pid.txt (pid + port), .tmp\serve\serve.log (stderr), .tmp\serve\serve.out.log (stdout).
# Exit codes: 0 ok (started, already running, stopped) / 1 failure.
# Sandbox note: Stop-Process on a process started by another command is denied PROCESS_TERMINATE (taskkill /F too);
# only the Start-Process -PassThru handle held in that same command can Kill, so a -Stop failure here is an
# environment limitation, not a logic bug (a normal shell is standard behavior; the main session's 8787 is ended by its own job).
# ASCII-only: Windows PowerShell 5.1 misreads UTF-8 without BOM.

param(
  [int]$Port = 8787,
  [switch]$Stop,
  [int]$HealthTimeoutSec = 60,
  [string]$SimoHome = 'E:\dsh_home\workspaces\agent\data',
  [ValidateSet('real', 'mock')][string]$Model = 'real',
  [string]$Exe = ''
)

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
# Default executable stays simo-8787-final10.exe; -Exe overrides it (relative paths resolve from the repo root).
$exe = $Exe
if (-not $exe) {
  $exe = Join-Path $root 'backend\simo-8787-final10.exe'
} elseif (-not [System.IO.Path]::IsPathRooted($exe)) {
  $exe = Join-Path $root $exe
}
$tmp = Join-Path $root '.tmp\serve'
# The default port keeps the original pid/log names; other ports get their own files, so a
# second isolated instance cannot overwrite the default instance's pid or logs.
$suffix = if ($Port -eq 8787) { '' } else { "-$Port" }
$pidFile = Join-Path $tmp "pid$suffix.txt"
$logFile = Join-Path $tmp "serve$suffix.log"
$outLog = Join-Path $tmp "serve$suffix.out.log"

New-Item -ItemType Directory -Path $tmp -Force | Out-Null

function Get-Health {
  param([int]$P)
  try {
    $response = Invoke-WebRequest -Uri "http://127.0.0.1:$P/api/health" -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
    if ($response.StatusCode -eq 200) { return $response.Content }
  } catch {
    return $null
  }
  return $null
}

function Get-ListenerPid {
  param([int]$P)
  try {
    foreach ($line in (& netstat -ano 2>$null)) {
      if ($line -match "TCP\s+\S+:$P\s+\S+\s+LISTENING\s+(\d+)\s*$") { return [int]$Matches[1] }
    }
  } catch {
    return 0
  }
  return 0
}

function Show-LogTail {
  param([string]$Path, [int]$Count = 20)
  if (Test-Path -LiteralPath $Path) {
    Write-Output "--- tail $Path (last $Count lines) ---"
    Get-Content -LiteralPath $Path -Tail $Count -ErrorAction SilentlyContinue | ForEach-Object { Write-Output $_ }
    Write-Output '--- end tail ---'
  } else {
    Write-Output "log not found: $Path"
  }
}

if ($Stop) {
  if (-not (Test-Path -LiteralPath $pidFile)) {
    Write-Output "STOP_FAIL pid file not found: $pidFile (this script only stops instances it started)"
    exit 1
  }
  $lines = @(Get-Content -LiteralPath $pidFile)
  $targetPid = 0
  if ($lines.Count -eq 0 -or -not [int]::TryParse(([string]$lines[0]).Trim(), [ref]$targetPid)) {
    Write-Output "STOP_FAIL cannot parse a pid from $pidFile"
    exit 1
  }
  $recordedPort = 0
  foreach ($line in $lines) {
    if ([string]$line -match '^port=(\d+)') { $recordedPort = [int]$Matches[1] }
  }
  if ($recordedPort -gt 0 -and $recordedPort -ne $Port) {
    Write-Output "STOP_FAIL pid file records port=$recordedPort but this call targets port=$Port; refusing to stop the wrong instance."
    exit 1
  }
  try {
    $proc = Get-Process -Id $targetPid -ErrorAction Stop
  } catch {
    Write-Output "STOP_FAIL pid=$targetPid is not running: $($_.Exception.Message)"
    exit 1
  }
  if ($proc.ProcessName -notlike 'simo*') {
    Write-Output "STOP_FAIL pid=$targetPid is '$($proc.ProcessName)', not a simo backend; refusing."
    exit 1
  }
  try {
    Stop-Process -Id $targetPid -ErrorAction Stop
  } catch {
    Write-Output "STOP_FAIL Stop-Process failed for pid=$targetPid : $($_.Exception.Message)"
    exit 1
  }
  $deadline = (Get-Date).AddSeconds(10)
  while ((Get-Date) -lt $deadline) {
    $alive = Get-Process -Id $targetPid -ErrorAction SilentlyContinue
    if (-not $alive) { break }
    Start-Sleep -Milliseconds 200
  }
  if (Get-Process -Id $targetPid -ErrorAction SilentlyContinue) {
    Write-Output "STOP_FAIL pid=$targetPid is still alive after Stop-Process"
    exit 1
  }
  Write-Output "STOPPED pid=$targetPid port=$Port"
  Write-Output "kept pid file: $pidFile"
  exit 0
}

$health = Get-Health $Port
if ($health) {
  $existingPid = Get-ListenerPid $Port
  Write-Output "SERVE_ALREADY port=$Port pid=$existingPid"
  Write-Output "health=$health"
  exit 0
}

$holderPid = Get-ListenerPid $Port
if ($holderPid -ne 0) {
  Write-Output "SERVE_FAIL port=$Port is held by pid=$holderPid but /api/health did not return 200; not starting a second instance."
  exit 1
}

if (-not (Test-Path -LiteralPath $exe)) {
  Write-Output "SERVE_FAIL executable not found: $exe"
  exit 1
}

New-Item -ItemType Directory -Path $SimoHome -Force | Out-Null
$env:SIMO_HOME = $SimoHome
Write-Output "STARTING port=$Port home=$SimoHome"
Write-Output "exe=$exe"

try {
  $proc = Start-Process -FilePath $exe `
    -ArgumentList @('serve', '-addr', "127.0.0.1:$Port", '-model', $Model) `
    -WorkingDirectory $root `
    -RedirectStandardOutput $outLog `
    -RedirectStandardError $logFile `
    -WindowStyle Hidden `
    -PassThru -ErrorAction Stop
} catch {
  Write-Output "SERVE_FAIL Start-Process failed: $($_.Exception.Message)"
  exit 1
}

@(
  "$($proc.Id)",
  "port=$Port",
  "exe=$exe",
  "home=$SimoHome",
  "started=$((Get-Date).ToString('o'))"
) | Set-Content -LiteralPath $pidFile -Encoding ascii
Write-Output "pid=$($proc.Id) written to $pidFile"

$deadline = (Get-Date).AddSeconds($HealthTimeoutSec)
$body = $null
while ((Get-Date) -lt $deadline) {
  $body = Get-Health $Port
  if ($body) { break }
  $proc.Refresh()
  if ($proc.HasExited) { break }
  Start-Sleep -Milliseconds 500
}

if ($body) {
  Write-Output "SERVE_OK port=$Port pid=$($proc.Id)"
  Write-Output "health=$body"
  exit 0
}

$proc.Refresh()
if ($proc.HasExited) {
  $reason = "process exited with code $($proc.ExitCode)"
} else {
  $reason = "health did not return 200 within ${HealthTimeoutSec}s"
}
Write-Output "SERVE_FAIL port=$Port pid=$($proc.Id) reason=$reason"
Show-LogTail $logFile 20
exit 1


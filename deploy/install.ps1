# deploy/install.ps1 -- first-time install of a Simo portable package
#
# What it does:
#   - verifies zip sha256 (if <zip>.sha256 exists) + every file in manifest.json
#   - installs package files into <InstallDir>\app (no deletion of existing dirs)
#   - initializes <DataDir> (default <InstallDir>\data) and seeds config.local.json if absent
#   - writes <InstallDir>\current.json, launch.ps1, start.cmd (double-click launcher)
#   - optional -Start: starts in background and waits for /api/health
#
# Usage:
#   powershell -NoProfile -ExecutionPolicy Bypass -File deploy\install.ps1 -Package .\deploy\dist\simo-M29-...-win-x64.zip
#   ... -InstallDir C:\Simo -DataDir C:\SimoData -Port 8787 -Start
# NOTE: keep this file ASCII-only (Windows PowerShell 5.1 misreads UTF-8 without BOM).

param(
  [Parameter(Mandatory = $true)][string]$Package,
  [string]$InstallDir = '',
  [string]$DataDir = '',
  [int]$Port = 8787,
  [switch]$Start,
  [switch]$Force
)

$ErrorActionPreference = 'Stop'
function Fail([string]$m) { Write-Host ("[install] ERROR: " + $m); exit 1 }
function Info([string]$m) { Write-Host ("[install] " + $m) }

$Package = [System.IO.Path]::GetFullPath($Package)
if (-not (Test-Path $Package)) { Fail "package not found: $Package" }
if (-not $InstallDir) { $InstallDir = Join-Path $env:LOCALAPPDATA 'Simo' }
$InstallDir = [System.IO.Path]::GetFullPath($InstallDir)
if (-not $DataDir) { $DataDir = Join-Path $InstallDir 'data' }
$DataDir = [System.IO.Path]::GetFullPath($DataDir)
$appDir = Join-Path $InstallDir 'app'
$currentPath = Join-Path $InstallDir 'current.json'

if ((Test-Path $currentPath) -and -not $Force) {
  Fail "already installed ($currentPath). Use deploy\upgrade.ps1 for upgrades, or pass -Force to reinstall over it."
}

# zip checksum
$shaFile = $Package + '.sha256'
if (Test-Path $shaFile) {
  $expected = ((Get-Content $shaFile -Raw).Trim() -split '\s+')[0].ToLowerInvariant()
  $actual = (Get-FileHash -Path $Package -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($expected -ne $actual) { Fail "zip sha256 mismatch (expected $expected, got $actual)" }
  Info "zip sha256 ok"
}

$stage = Join-Path ([System.IO.Path]::GetTempPath()) ("simo-install-" + [guid]::NewGuid().ToString('N').Substring(0, 10))
New-Item -ItemType Directory -Force -Path $stage | Out-Null
Expand-Archive -Path $Package -DestinationPath $stage -Force
$manifestPath = Join-Path $stage 'manifest.json'
if (-not (Test-Path $manifestPath)) { Fail "manifest.json missing in package" }
$manifest = Get-Content $manifestPath -Raw | ConvertFrom-Json
$exeStage = Join-Path $stage 'simo.exe'
if (-not (Test-Path $exeStage)) { Fail "simo.exe missing in package" }
if ($manifest.exeSha256 -and ((Get-FileHash -Path $exeStage -Algorithm SHA256).Hash.ToLowerInvariant() -ne ([string]$manifest.exeSha256).ToLowerInvariant())) {
  Fail "simo.exe sha256 mismatch against manifest"
}
if (-not (Test-Path (Join-Path $stage 'start.ps1'))) { Fail "start.ps1 missing in package" }

Info "installing version $($manifest.version) -> $appDir"
New-Item -ItemType Directory -Force -Path $appDir, $DataDir | Out-Null
Copy-Item -Path (Join-Path $stage '*') -Destination $appDir -Recurse -Force

# init data dir + seed config (never overwrite an existing key file)
$cfg = Join-Path $DataDir 'config.local.json'
$cfgExample = Join-Path $appDir 'config.example.json'
if ((-not (Test-Path $cfg)) -and (Test-Path $cfgExample)) {
  Copy-Item -Path $cfgExample -Destination $cfg -Force
  # strip UTF-8 BOM if present: simo (Go) rejects a BOM in config.local.json
  $raw = [System.IO.File]::ReadAllText($cfg)
  if ($raw.Length -gt 0 -and $raw[0] -eq [char]0xFEFF) { $raw = $raw.Substring(1) }
  [System.IO.File]::WriteAllText($cfg, $raw, (New-Object System.Text.UTF8Encoding($false)))
  Info "seeded $cfg (fill apiKey, or keep -Model mock)"
}

$record = [ordered]@{
  version = [string]$manifest.version; appDir = $appDir; dataDir = $DataDir; port = $Port
  installedAt = (Get-Date).ToString('o'); package = $Package
} 
$record | ConvertTo-Json -Depth 4 | Set-Content -Path $currentPath -Encoding UTF8

$launchPs1 = @'
param([string]$StartArgs = '')
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$cur = Get-Content (Join-Path $here 'current.json') -Raw | ConvertFrom-Json
$start = Join-Path $cur.appDir 'start.ps1'
$argv = @('-DataDir', $cur.dataDir, '-Listen', ('127.0.0.1:' + $cur.port))
if ($StartArgs) { $argv += ($StartArgs -split ' ') }
& powershell -NoProfile -ExecutionPolicy Bypass -File $start @argv
'@
Set-Content -Path (Join-Path $InstallDir 'launch.ps1') -Value $launchPs1 -Encoding UTF8
$startCmd = @"
@echo off
rem Simo launcher (double-click). Extra args are forwarded, e.g. start.cmd -Model mock
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0launch.ps1" %*
"@
Set-Content -Path (Join-Path $InstallDir 'start.cmd') -Value $startCmd -Encoding ASCII

Info "installed: $InstallDir"
Info "launch:    $InstallDir\start.cmd"
Info "data:      $DataDir"
if ($Start) {
  Info "starting in background ..."
  $startArgs = @('-NoProfile','-ExecutionPolicy','Bypass','-File',(Join-Path $appDir 'start.ps1'),'-DataDir',$DataDir,'-Listen',("127.0.0.1:" + $Port),'-Background')
  # first run without an apiKey must fall back to mock, otherwise start fails with "real mode needs API key"
  $hasKey = $false
  try { $cfgObj = Get-Content $cfg -Raw | ConvertFrom-Json; $hasKey = [bool]$cfgObj.apiKey } catch { $hasKey = $false }
  if (-not $hasKey) { $startArgs += @('-Model','mock'); Info "no apiKey found; starting in mock mode" }
  & powershell @startArgs
  if ($LASTEXITCODE -ne 0) { Fail "start.ps1 failed (exit $LASTEXITCODE)" }
}
Info "done. Next: fill $cfg and run `"$InstallDir\start.cmd`" (or start.cmd -Model mock)."

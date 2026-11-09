# deploy/upgrade.ps1 -- upgrade (or roll back) an installed Simo to a newer portable package
#
# Flow:
#   1. verify the new package (zip sha256 + manifest + exe sha256)
#   2. stop the instance recorded for this data dir (start.ps1 -Stop; never touches other processes)
#   3. pre-upgrade backup (deploy/backup.ps1, skip with -SkipBackup)
#   4. install the new version into <InstallDir>\versions\<version>, save previous.json
#   5. smoke: start the new version in background on the configured port, health-check, stop
#   6. on smoke failure: automatic rollback (previous.json + data backup) unless -NoAutoRollback
#
# Rollback:
#   powershell -NoProfile -ExecutionPolicy Bypass -File deploy\upgrade.ps1 -Rollback -InstallDir C:\Simo
# NOTE: keep this file ASCII-only (Windows PowerShell 5.1 misreads UTF-8 without BOM).

param(
  [string]$Package = '',
  [string]$InstallDir = '',
  [string]$DataDir = '',
  [int]$Port = 0,
  [switch]$SkipBackup,
  [switch]$NoAutoRollback,
  [switch]$Rollback
)

$ErrorActionPreference = 'Stop'
function Fail([string]$m) { Write-Host ("[upgrade] ERROR: " + $m); exit 1 }
function Info([string]$m) { Write-Host ("[upgrade] " + $m) }

if (-not $InstallDir) { $InstallDir = Join-Path $env:LOCALAPPDATA 'Simo' }
$InstallDir = [System.IO.Path]::GetFullPath($InstallDir)
$currentPath = Join-Path $InstallDir 'current.json'
$previousPath = Join-Path $InstallDir 'previous.json'
if (-not (Test-Path $currentPath)) { Fail "not installed under $InstallDir (use deploy\install.ps1 first)" }
$cur = Get-Content $currentPath -Raw | ConvertFrom-Json
if (-not $DataDir) { $DataDir = [string]$cur.dataDir }
$DataDir = [System.IO.Path]::GetFullPath($DataDir)
if ($Port -le 0) { $Port = if ($cur.port) { [int]$cur.port } else { 8787 } }

$startPs1 = Join-Path $cur.appDir 'start.ps1'
$backupPs1 = Join-Path $PSScriptRoot 'backup.ps1'
$restorePs1 = Join-Path $PSScriptRoot 'restore.ps1'

# ---------------------------------------------------------------- rollback mode
if ($Rollback) {
  if (-not (Test-Path $previousPath)) { Fail "no previous.json found (nothing to roll back to)" }
  $prev = Get-Content $previousPath -Raw | ConvertFrom-Json
  $prevBackup = [string]$prev.backup
  if (-not $prevBackup -or -not (Test-Path $prevBackup)) {
    Fail ("no data backup recorded/found for rollback (" + $prevBackup + "). Refusing to switch version: the newer schema would be unreadable to the old binary. Restore a backup manually with deploy\restore.ps1 first.")
  }
  if (Test-Path $startPs1) { & powershell -NoProfile -ExecutionPolicy Bypass -File $startPs1 -Stop -DataDir $DataDir }
  Info "restoring data backup: $prevBackup"
  & powershell -NoProfile -ExecutionPolicy Bypass -File $restorePs1 -Backup $prevBackup -DataDir $DataDir -Force
  if ($LASTEXITCODE -ne 0) { Fail "restore failed; version NOT switched (still $($cur.version))" }
  $prev | ConvertTo-Json -Depth 4 | Set-Content -Path $currentPath -Encoding UTF8
  Info ("rolled back to version " + $prev.version)
  exit 0
}

if (-not $Package) { Fail "pass -Package <simo-...-win-x64.zip>" }
$Package = [System.IO.Path]::GetFullPath($Package)
if (-not (Test-Path $Package)) { Fail "package not found: $Package" }

# ---------------------------------------------------------------- verify package
$shaFile = $Package + '.sha256'
if (Test-Path $shaFile) {
  $expected = ((Get-Content $shaFile -Raw).Trim() -split '\s+')[0].ToLowerInvariant()
  $actual = (Get-FileHash -Path $Package -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($expected -ne $actual) { Fail "zip sha256 mismatch (expected $expected, got $actual)" }
  Info "zip sha256 ok"
}
$stage = Join-Path ([System.IO.Path]::GetTempPath()) ("simo-upgrade-" + [guid]::NewGuid().ToString('N').Substring(0, 10))
New-Item -ItemType Directory -Force -Path $stage | Out-Null
Expand-Archive -Path $Package -DestinationPath $stage -Force
$manifestPath = Join-Path $stage 'manifest.json'
if (-not (Test-Path $manifestPath)) { Fail "manifest.json missing in package" }
$manifest = Get-Content $manifestPath -Raw | ConvertFrom-Json
$newVersion = [string]$manifest.version
$exeStage = Join-Path $stage 'simo.exe'
if (-not (Test-Path $exeStage)) { Fail "simo.exe missing in package" }
if ($manifest.exeSha256 -and ((Get-FileHash -Path $exeStage -Algorithm SHA256).Hash.ToLowerInvariant() -ne ([string]$manifest.exeSha256).ToLowerInvariant())) {
  Fail "simo.exe sha256 mismatch against manifest"
}
Info "target version: $newVersion (current: $($cur.version))"

# ---------------------------------------------------------------- stop + backup
if (Test-Path $startPs1) { & powershell -NoProfile -ExecutionPolicy Bypass -File $startPs1 -Stop -DataDir $DataDir }

$backupZip = ''
if (-not $SkipBackup -and (Test-Path $backupPs1)) {
  Info "pre-upgrade backup ..."
  $out = & powershell -NoProfile -ExecutionPolicy Bypass -File $backupPs1 -DataDir $DataDir -Name 'pre-upgrade' 2>&1 | Out-String
  $m = [regex]::Match($out, '(?m)^BACKUP_ZIP=(.+?)\s*$')
  if ($m.Success) { $backupZip = $m.Groups[1].Value.Trim() }
  if (-not $backupZip) {
    $m2 = [regex]::Match($out, '(?m)^\[backup\]\s+zip:\s+(.+?)\s+\(')
    if ($m2.Success) { $backupZip = $m2.Groups[1].Value.Trim() }
  }
  if (-not $backupZip -or -not (Test-Path $backupZip)) {
    Fail ("pre-upgrade backup failed (no BACKUP_ZIP path captured). Aborting before any version switch. Output: " + $out)
  }
  Info ("backup: " + $backupZip)
} elseif (-not $SkipBackup) {
  Info "backup.ps1 not found; continuing WITHOUT a data backup"
}

# ---------------------------------------------------------------- install new version
$versionsRoot = Join-Path $InstallDir 'versions'
$newApp = Join-Path $versionsRoot $newVersion
New-Item -ItemType Directory -Force -Path $newApp | Out-Null
Copy-Item -Path (Join-Path $stage '*') -Destination $newApp -Recurse -Force

$prevRecord = [ordered]@{
  version = [string]$cur.version; appDir = [string]$cur.appDir; dataDir = $DataDir; port = $Port
  backup = $backupZip; savedAt = (Get-Date).ToString('o')
}
$prevRecord | ConvertTo-Json -Depth 4 | Set-Content -Path $previousPath -Encoding UTF8

$record = [ordered]@{
  version = $newVersion; appDir = $newApp; dataDir = $DataDir; port = $Port
  installedAt = (Get-Date).ToString('o'); package = $Package; previousVersion = [string]$cur.version
}
$record | ConvertTo-Json -Depth 4 | Set-Content -Path $currentPath -Encoding UTF8
$logLine = (Get-Date).ToString('o') + " upgrade " + $cur.version + " -> " + $newVersion + " package=" + $Package + " backup=" + $backupZip
Add-Content -Path (Join-Path $InstallDir 'upgrades.log') -Value $logLine -Encoding UTF8

# ---------------------------------------------------------------- smoke test
$newStart = Join-Path $newApp 'start.ps1'
$smokeOk = $false
if (Test-Path $newStart) {
  Info "smoke: starting $newVersion in background on 127.0.0.1:$Port ..."
  $startArgs = @('-NoProfile','-ExecutionPolicy','Bypass','-File',$newStart,'-DataDir',$DataDir,'-Listen',("127.0.0.1:" + $Port),'-Background')
  # no apiKey => start smoke in mock mode (same fallback as install.ps1)
  $hasKey = $false
  $cfgFile = Join-Path $DataDir 'config.local.json'
  try { $cfgObj = Get-Content $cfgFile -Raw | ConvertFrom-Json; $hasKey = [bool]$cfgObj.apiKey } catch { $hasKey = $false }
  if (-not $hasKey) { $startArgs += @('-Model','mock'); Info "no apiKey found; smoke in mock mode" }
  & powershell @startArgs
  $smokeOk = ($LASTEXITCODE -eq 0)
  & powershell -NoProfile -ExecutionPolicy Bypass -File $newStart -Stop -DataDir $DataDir
} else {
  Info "warning: start.ps1 missing in new version; skipping smoke test"
  $smokeOk = $true
}

if (-not $smokeOk) {
  Write-Host "[upgrade] smoke test FAILED for $newVersion"
  if (-not $NoAutoRollback) {
    Info "automatic rollback ..."
    $prevRecord | ConvertTo-Json -Depth 4 | Set-Content -Path $currentPath -Encoding UTF8
    if ($backupZip -and (Test-Path $restorePs1)) {
      & powershell -NoProfile -ExecutionPolicy Bypass -File $restorePs1 -Backup $backupZip -DataDir $DataDir -Force
    }
    Info "rolled back to $($cur.version); data restored from backup (if any)"
    exit 1
  }
  Fail "smoke test failed; previous current.json kept in $previousPath (data backup: $backupZip)"
}

Info ("upgraded " + $cur.version + " -> " + $newVersion)
if ($backupZip) { Info ("data backup: " + $backupZip + "  (rollback: deploy\upgrade.ps1 -Rollback -InstallDir `"" + $InstallDir + "`")") }
Info ("start: " + (Join-Path $InstallDir 'start.cmd'))

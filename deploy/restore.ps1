# deploy/restore.ps1 -- verify and restore a Simo backup into an SIMO_HOME
#
# Safety:
#   - verifies the zip sha256 (if <zip>.sha256 exists) and every file sha256 in manifest.json
#   - optionally runs sqlite3 PRAGMA integrity_check on the restored db (when python is available)
#   - refuses to overwrite a non-empty data dir unless -Force
#   - with -Force: creates a pre-restore backup first, then MOVES the current db files into
#     <DataDir>\pre-restore-<timestamp>\ (nothing is deleted)
#   - refuses while a Simo instance is recorded as running for this data dir
#
# Usage:
#   powershell -NoProfile -ExecutionPolicy Bypass -File deploy\restore.ps1 -Backup C:\backups\simo-backup-data-20260101-120000.zip -DataDir C:\Simo\data -Force
#   powershell -NoProfile -ExecutionPolicy Bypass -File deploy\restore.ps1 -Backup <zip> -VerifyOnly
# NOTE: keep this file ASCII-only (Windows PowerShell 5.1 misreads UTF-8 without BOM).

param(
  [Parameter(Mandatory = $true)][string]$Backup,
  [string]$DataDir = '',
  [switch]$Force,
  [switch]$VerifyOnly,
  [switch]$RestoreConfig,
  [switch]$RestoreArtifacts,
  [string]$Python = ''
)

$ErrorActionPreference = 'Stop'
function Fail([string]$m) { Write-Host ("[restore] ERROR: " + $m); exit 1 }
function Info([string]$m) { Write-Host ("[restore] " + $m) }

$Backup = [System.IO.Path]::GetFullPath($Backup)
if (-not (Test-Path $Backup)) { Fail "backup not found: $Backup" }

# sha256 of the zip
$shaFile = $Backup + '.sha256'
if (Test-Path $shaFile) {
  $expected = ((Get-Content $shaFile -Raw).Trim() -split '\s+')[0].ToLowerInvariant()
  $actual = (Get-FileHash -Path $Backup -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($expected -ne $actual) { Fail "zip sha256 mismatch: expected $expected, got $actual" }
  Info "zip sha256 ok"
} else {
  Info "no .sha256 next to the zip; skipping zip checksum (manifest is still verified)"
}

$stage = Join-Path ([System.IO.Path]::GetTempPath()) ("simo-restore-" + [guid]::NewGuid().ToString('N').Substring(0, 10))
New-Item -ItemType Directory -Force -Path $stage | Out-Null
Expand-Archive -Path $Backup -DestinationPath $stage -Force
$manifestPath = Join-Path $stage 'manifest.json'
if (-not (Test-Path $manifestPath)) { Fail "manifest.json missing in backup" }
$manifest = Get-Content $manifestPath -Raw | ConvertFrom-Json
if ($manifest.kind -and $manifest.kind -ne 'simo-backup') { Fail "unexpected manifest kind: $($manifest.kind)" }

# verify every manifest file
$bad = @()
foreach ($entry in @($manifest.files)) {
  $p = Join-Path $stage ($entry.path -replace '/', '\')
  if (-not (Test-Path $p)) { $bad += ($entry.path + ' (missing)'); continue }
  $h = (Get-FileHash -Path $p -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($h -ne ([string]$entry.sha256).ToLowerInvariant()) { $bad += ($entry.path + ' (sha256 mismatch)') }
}
if ($bad.Count -gt 0) { Fail ("manifest verification failed: " + ($bad -join '; ')) }
Info ("manifest ok: " + @($manifest.files).Count + " files")

$dbSrc = Join-Path $stage 'simo.db'
if (-not (Test-Path $dbSrc)) { Fail "simo.db missing in backup" }

if (-not $Python) {
  if ($env:SIMO_PYTHON -and (Test-Path $env:SIMO_PYTHON)) { $Python = $env:SIMO_PYTHON }
  elseif (Get-Command python -ErrorAction SilentlyContinue) { $Python = (Get-Command python).Source }
  elseif (Get-Command py -ErrorAction SilentlyContinue) { $Python = (Get-Command py).Source }
}
$havePython = $false
if ($Python -and (Test-Path $Python)) {
  try {
    & $Python -c "import sqlite3" 2>$null | Out-Null
    $havePython = ($LASTEXITCODE -eq 0)
  } catch { $havePython = $false }
}
if ($havePython) {
  $pyScript = Join-Path $stage '_integrity.py'
  $pyCode = @'
import sqlite3, sys
con = sqlite3.connect(sys.argv[1])
row = con.execute("PRAGMA integrity_check").fetchone()
print(row[0])
con.close()
'@
  Set-Content -Path $pyScript -Value $pyCode -Encoding ASCII
  $result = & $Python $pyScript $dbSrc
  Info ("sqlite integrity_check: " + $result)
  if (($result | Out-String).Trim() -ne 'ok') { Fail "sqlite integrity_check failed: $result" }
} else {
  Info "no usable python; skipping sqlite PRAGMA integrity_check"
}

if ($VerifyOnly) { Info "verify-only: backup is valid"; exit 0 }

if (-not $DataDir) { Fail "pass -DataDir <target SIMO_HOME> (or -VerifyOnly)" }
$DataDir = [System.IO.Path]::GetFullPath($DataDir)
$statePath = Join-Path $DataDir '.simo-instance.json'
if (Test-Path $statePath) {
  try {
    $st = Get-Content $statePath -Raw | ConvertFrom-Json
    if (Get-Process -Id ([int]$st.pid) -ErrorAction SilentlyContinue) {
      Fail "a Simo instance is running for $DataDir (pid=$($st.pid)); stop it first: start.ps1 -Stop -DataDir `"$DataDir`""
    }
  } catch { }
}

$targetDb = Join-Path $DataDir 'simo.db'
New-Item -ItemType Directory -Force -Path $DataDir | Out-Null
if ((Test-Path $targetDb) -and -not $Force) {
  Fail "target already has simo.db: $targetDb (use -Force to back it up and replace)"
}

$preDir = ''
if (Test-Path $targetDb) {
  # pre-restore backup (best effort; do not block the restore on backup tooling)
  $backupPs1 = Join-Path $PSScriptRoot 'backup.ps1'
  if (Test-Path $backupPs1) {
    Info "creating pre-restore backup ..."
    & powershell -NoProfile -ExecutionPolicy Bypass -File $backupPs1 -DataDir $DataDir -Name 'pre-restore'
  }
  $stamp = (Get-Date).ToString('yyyyMMdd-HHmmss')
  $preDir = Join-Path $DataDir ('pre-restore-' + $stamp)
  New-Item -ItemType Directory -Force -Path $preDir | Out-Null
  foreach ($name in @('simo.db', 'simo.db-wal', 'simo.db-shm')) {
    $src = Join-Path $DataDir $name
    if (Test-Path $src) { Move-Item -Path $src -Destination (Join-Path $preDir $name) -Force }
  }
  Info "moved previous db files to: $preDir"
}

Copy-Item -Path $dbSrc -Destination $targetDb -Force
# also restore WAL/SHM if the backup captured a stopped-server copy (data may live in the WAL)
foreach ($suffix in @('-wal', '-shm')) {
  $srcW = Join-Path $stage ('simo.db' + $suffix)
  if (Test-Path $srcW) { Copy-Item -Path $srcW -Destination ($targetDb + $suffix) -Force }
}
if ((Test-Path (Join-Path $stage 'config.local.json')) -and $RestoreConfig) {
  Copy-Item -Path (Join-Path $stage 'config.local.json') -Destination (Join-Path $DataDir 'config.local.json') -Force
  Info "config.local.json restored"
}
if ((Test-Path (Join-Path $stage 'artifacts')) -and $RestoreArtifacts) {
  Copy-Item -Path (Join-Path $stage 'artifacts') -Destination (Join-Path $DataDir 'artifacts') -Recurse -Force
  Info "artifacts restored"
}

Info ("restored into: " + $targetDb)
if ($preDir) { Info ("rollback: stop the server, move files back from " + $preDir) }
Info "start:    powershell -NoProfile -ExecutionPolicy Bypass -File start.ps1 -DataDir `"$DataDir`""

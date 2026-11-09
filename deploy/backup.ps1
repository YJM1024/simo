# deploy/backup.ps1 -- consistent backup of a Simo AGENTD_HOME
#
# - Prefers a consistent SQLite backup via Python's sqlite3 backup API (safe while the server runs).
# - Falls back to a plain file copy only when the instance is stopped (WAL files are copied too).
# - Produces <OutDir>\simo-backup-<name>-<yyyyMMdd-HHmmss>.zip + .sha256 + manifest inside the zip.
# - Never deletes existing directories or existing backups. Existing zip -> error unless -Force.
#
# Usage:
#   powershell -NoProfile -ExecutionPolicy Bypass -File deploy\backup.ps1 -DataDir C:\Simo\data
#   powershell -NoProfile -ExecutionPolicy Bypass -File deploy\backup.ps1 -DataDir C:\Simo\data -IncludeArtifacts -OutDir D:\backups
# NOTE: keep this file ASCII-only (Windows PowerShell 5.1 misreads UTF-8 without BOM).

param(
  [Parameter(Mandatory = $true)][string]$DataDir,
  [string]$OutDir = '',
  [string]$Name = '',
  [switch]$IncludeArtifacts,
  [string]$Python = '',
  [switch]$Force
)

$ErrorActionPreference = 'Stop'
function Fail([string]$m) { Write-Host ("[backup] ERROR: " + $m); exit 1 }
function Info([string]$m) { Write-Host ("[backup] " + $m) }

$DataDir = [System.IO.Path]::GetFullPath($DataDir)
$db = Join-Path $DataDir 'agentd.db'
if (-not (Test-Path $db)) { Fail "agentd.db not found under $DataDir" }
if (-not $OutDir) { $OutDir = Join-Path $DataDir 'backups' }
$OutDir = [System.IO.Path]::GetFullPath($OutDir)
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

# is this data dir currently served by a running instance?
$statePath = Join-Path $DataDir '.simo-instance.json'
$running = $false
if (Test-Path $statePath) {
  try {
    $st = Get-Content $statePath -Raw | ConvertFrom-Json
    if (Get-Process -Id ([int]$st.pid) -ErrorAction SilentlyContinue) { $running = $true }
  } catch { }
}
Info ("data:    " + $DataDir)
Info ("running: " + $running)

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
if ($running -and -not $havePython) {
  Fail "the server is running and a usable python was not found; stop it first (start.ps1 -Stop) or pass -Python <python.exe> for a consistent hot backup"
}

$stage = Join-Path ([System.IO.Path]::GetTempPath()) ("simo-backup-" + [guid]::NewGuid().ToString('N').Substring(0, 10))
New-Item -ItemType Directory -Force -Path $stage | Out-Null
$stageDb = Join-Path $stage 'agentd.db'

if ($havePython) {
  $pyScript = Join-Path $stage '_sqlite_backup.py'
  $pyCode = @'
import sqlite3, sys
src = sqlite3.connect(sys.argv[1])
dst = sqlite3.connect(sys.argv[2])
src.backup(dst)
dst.close(); src.close()
'@
  Set-Content -Path $pyScript -Value $pyCode -Encoding ASCII
  Info "creating consistent SQLite snapshot ..."
  & $Python $pyScript $db $stageDb
  if ($LASTEXITCODE -ne 0) { Fail "python sqlite3 backup failed (exit $LASTEXITCODE)" }
} else {
  Info "server is stopped; copying db + WAL files ..."
  Copy-Item -Path $db -Destination $stageDb -Force
  foreach ($suffix in @('-wal', '-shm')) {
    $p = $db + $suffix
    if (Test-Path $p) { Copy-Item -Path $p -Destination $stageDb$suffix -Force }
  }
}

# optional config / version / artifacts
$config = Join-Path $DataDir 'config.local.json'
if (Test-Path $config) { Copy-Item -Path $config -Destination (Join-Path $stage 'config.local.json') -Force }
$versionFile = Join-Path $DataDir 'VERSION.txt'
if (Test-Path $versionFile) { Copy-Item -Path $versionFile -Destination (Join-Path $stage 'VERSION.txt') -Force }
if ($IncludeArtifacts) {
  $art = Join-Path $DataDir 'artifacts'
  if (Test-Path $art) {
    Info "copying artifacts ..."
    Copy-Item -Path $art -Destination (Join-Path $stage 'artifacts') -Recurse -Force
  }
}

$createdAt = (Get-Date).ToString('o')
$dbHash = (Get-FileHash -Path $stageDb -Algorithm SHA256).Hash.ToLowerInvariant()
$files = @()
foreach ($f in (Get-ChildItem -Path $stage -File -Recurse | Sort-Object FullName)) {
  $rel = $f.FullName.Substring($stage.Length).TrimStart('\').Replace('\', '/')
  $files += [ordered]@{ path = $rel; bytes = $f.Length; sha256 = (Get-FileHash -Path $f.FullName -Algorithm SHA256).Hash.ToLowerInvariant() }
}
$manifest = [ordered]@{
  kind = 'simo-backup'; createdAt = $createdAt; dataDir = $DataDir; running = $running
  dbSha256 = $dbHash; files = $files
} | ConvertTo-Json -Depth 5
Set-Content -Path (Join-Path $stage 'manifest.json') -Value $manifest -Encoding UTF8

$safeName = ($DataDir.TrimEnd('\') -split '\\')[-1]
if ($Name) { $safeName = $safeName + '-' + ($Name -replace '[^0-9A-Za-z._-]', '_') }
$baseName = 'simo-backup-' + $safeName + '-' + (Get-Date).ToString('yyyyMMdd-HHmmss')
$zip = Join-Path $OutDir ($baseName + '.zip')
if ((Test-Path $zip) -and -not $Force) { Fail "backup already exists: $zip (use -Force to overwrite)" }
if (Test-Path $zip) { Remove-Item -Path $zip -Force }
Compress-Archive -Path (Join-Path $stage '*') -DestinationPath $zip -CompressionLevel Optimal
$zipHash = (Get-FileHash -Path $zip -Algorithm SHA256).Hash.ToLowerInvariant()
Set-Content -Path ($zip + '.sha256') -Value ($zipHash + '  ' + (Split-Path -Leaf $zip)) -Encoding ASCII
Info ("zip:     " + $zip + " (" + [math]::Round((Get-Item $zip).Length / 1MB, 2) + " MB)")
Write-Output ("BACKUP_ZIP=" + $zip)
Info ("sha256:  " + $zipHash)
Info "restore: powershell -NoProfile -ExecutionPolicy Bypass -File deploy\restore.ps1 -Backup `"$zip`" -DataDir `"$DataDir`" -Force"

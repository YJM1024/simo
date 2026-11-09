# deploy/package.ps1 -- build a portable Simo (simo.exe + start.ps1 + README + example config) zip
#
# Produces:
#   <OutDir>\simo-<version>-win-x64.zip
#   <OutDir>\simo-<version>-win-x64.zip.sha256   ("<sha256>  <file>" format)
#
# What goes into the zip:
#   simo.exe            - server binary (built from source unless -SkipBuild)
#   start.ps1           - hardened launcher (single-instance / port check / health check / logs)
#   README.md           - quick-start + troubleshooting (generated below)
#   config.example.json - provider/baseURL/model/apiKey template (copy to <DataDir>\config.local.json)
#   VERSION.txt         - version + build time
#   manifest.json       - version/buildTime/exeSha256/file list
#
# Usage:
#   powershell -NoProfile -ExecutionPolicy Bypass -File deploy\package.ps1
#   powershell -NoProfile -ExecutionPolicy Bypass -File deploy\package.ps1 -SkipBuild -Version M29-dev
#   powershell -NoProfile -ExecutionPolicy Bypass -File deploy\package.ps1 -SkipWebBuild   # reuse existing web/dist, still build Go
#
# Notes:
#   - Full build needs Node + pnpm deps (web/) and the Go toolchain (toolchain/go.ps1 or `go` in PATH).
#     This environment may lack a working esbuild native binary -> use -SkipWebBuild when web/dist is current.
#   - This script never deletes existing directories. Output zip is only written when absent or -Force is set.
# NOTE: keep this file ASCII-only (Windows PowerShell 5.1 misreads UTF-8 without BOM).

param(
  [string]$Version = '',
  [string]$OutDir = '',
  [string]$Exe = '',
  [string]$Node = '',
  [string]$StageRoot = '',
  [switch]$SkipBuild,
  [switch]$SkipWebBuild,
  [switch]$NoZip,
  [switch]$Force
)

$ErrorActionPreference = 'Stop'

function Write-Step([string]$msg) { Write-Host ("[package] " + $msg) }
function Fail([string]$msg) { Write-Host ("[package] ERROR: " + $msg); exit 1 }

$deployDir = $PSScriptRoot
$repo = Split-Path -Parent $deployDir
if (-not $OutDir) { $OutDir = Join-Path $deployDir 'dist' }
$OutDir = [System.IO.Path]::GetFullPath($OutDir)
if (-not $Version) { $Version = 'M29-' + (Get-Date).ToString('yyyyMMdd-HHmm') }
$Version = $Version.Trim()
if ($Version -notmatch '^[0-9A-Za-z._-]{1,64}$') { Fail "invalid -Version '$Version' (allowed: letters/digits/._-, <=64 chars)" }

if (-not $Node) {
  $bundled = 'E:\dsh_home\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe'
  if (Test-Path $bundled) { $Node = $bundled } else { $Node = 'node' }
}

$buildTime = (Get-Date).ToString('o')
Write-Step "version: $Version"
Write-Step "output:  $OutDir"
Write-Step "build:   " + $(if ($SkipBuild) { 'skipped (-SkipBuild)' } elseif ($SkipWebBuild) { 'Go only (-SkipWebBuild)' } else { 'web + Go' })

# staging: prefer an explicit -StageRoot, then workspace .tmp (ops-policy), then system temp
if (-not $StageRoot) {
  if ($env:SIMO_STAGE_ROOT) { $StageRoot = $env:SIMO_STAGE_ROOT }
  elseif (Test-Path (Join-Path $repo '.tmp')) { $StageRoot = Join-Path $repo '.tmp' }
  else { $StageRoot = [System.IO.Path]::GetTempPath() }
}
$stage = Join-Path ([System.IO.Path]::GetFullPath($StageRoot)) ("simo-pkg-" + [guid]::NewGuid().ToString('N').Substring(0, 10))
New-Item -ItemType Directory -Force -Path $stage | Out-Null
Write-Step "staging: $stage"

$exeDst = Join-Path $stage 'simo.exe'

if (-not $SkipBuild) {
  if (-not $SkipWebBuild) {
    $buildScript = Join-Path $repo 'web\build.mjs'
    if (-not (Test-Path $buildScript)) { Fail "missing web\build.mjs" }
    Write-Step "building web assets (node web\build.mjs) ..."
    Push-Location (Join-Path $repo 'web')
    try {
      & $Node 'build.mjs'
      if ($LASTEXITCODE -ne 0) { Fail "web build failed (exit $LASTEXITCODE). Use -SkipWebBuild to reuse the existing agentd\internal\webui\dist." }
    } finally { Pop-Location }
  } else {
    Write-Step "skipping web build; reusing agentd\internal\webui\dist"
  }

  $goPs1 = Join-Path $repo 'toolchain\go.ps1'
  $goBin = Join-Path $repo 'toolchain\go\bin\go.exe'
  Write-Step "building simo.exe from source ..."
  Push-Location (Join-Path $repo 'agentd')
  try {
    $ldflags = '-s -w'
    $goArgs = @('build', '-trimpath', '-buildvcs=false', '-ldflags', $ldflags, '-o', $exeDst, './cmd/agentd')
    if (Test-Path $goPs1) { & $goPs1 @goArgs } elseif (Test-Path $goBin) { & $goBin @goArgs } else { & 'go' @goArgs }
    if ($LASTEXITCODE -ne 0) { Fail "go build failed (exit $LASTEXITCODE)" }
  } finally { Pop-Location }
} else {
  if (-not $Exe) {
    foreach ($candidate in @((Join-Path $repo 'agentd\simo.exe'), (Join-Path $repo 'simo.exe'))) {
      if (Test-Path $candidate) { $Exe = $candidate; break }
    }
  }
  if (-not $Exe -or -not (Test-Path $Exe)) { Fail "no prebuilt simo.exe found; pass -Exe <path> or drop -SkipBuild" }
  Copy-Item -Path $Exe -Destination $exeDst -Force
  Write-Step "using prebuilt exe: $Exe"
}

if (-not (Test-Path $exeDst)) { Fail "simo.exe was not produced" }

# ---------------------------------------------------------------- stage package files
$startSrc = Join-Path $repo 'start.ps1'
if (-not (Test-Path $startSrc)) { Fail "missing start.ps1 at repo root: $startSrc" }
Copy-Item -Path $startSrc -Destination (Join-Path $stage 'start.ps1') -Force

$readme = @"
# Simo portable package ($Version)

Built: $buildTime

## Quick start

1. Extract this zip into a new folder (for example C:\Simo).
2. Double-click start.cmd, or run:

       powershell -NoProfile -ExecutionPolicy Bypass -File .\start.ps1 -Model mock

   Real model: put your key into .\data\config.local.json first (copy config.example.json), then:

       powershell -NoProfile -ExecutionPolicy Bypass -File .\start.ps1 -Model real

3. Open http://127.0.0.1:8787 in a browser.

## Layout

  simo.exe               server binary
  start.ps1              launcher (single instance / port check / health check / logs)
  start.cmd              wrapper for double-click (mock mode by default)
  config.example.json    copy to .\data\config.local.json and fill apiKey
  VERSION.txt            version + build time
  manifest.json          file list + exe sha256

## Data and logs

  .\data\                 AGENTD_HOME (db, artifacts, workspace, logs, config.local.json)
  .\data\logs\            server stdout/stderr logs
  .\data\.simo-instance.json  pid/port record used by -Stop

## Stop

  powershell -NoProfile -ExecutionPolicy Bypass -File .\start.ps1 -Stop

Only the instance recorded in .\data\.simo-instance.json is stopped; unrelated Simo instances
and other programs are never touched.
"@
Set-Content -Path (Join-Path $stage 'README.md') -Value $readme -Encoding UTF8

$startCmd = @"
@echo off
rem Simo portable launcher (double-click). Starts in mock mode so it works without an API key.
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start.ps1" -Model mock %*
"@
Set-Content -Path (Join-Path $stage 'start.cmd') -Value $startCmd -Encoding ASCII

$configExample = @'
{
  "provider": "deepseek",
  "baseURL": "https://api.deepseek.com",
  "model": "deepseek-flash",
  "reasoning": {
    "default": "high",
    "byRole": { "secretary": "low", "expert": "high", "reviewer": "high", "summarizer": "low" },
    "offForFastPath": true
  },
  "apiKey": ""
}
'@
$noBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText((Join-Path $stage 'config.example.json'), $configExample, $noBom)
[System.IO.File]::WriteAllText((Join-Path $stage 'VERSION.txt'), ("version=" + $Version + [Environment]::NewLine + "buildTime=" + $buildTime), $noBom)

# manifest (exe sha256 + file list)
$exeHash = (Get-FileHash -Path $exeDst -Algorithm SHA256).Hash.ToLowerInvariant()
$files = @()
foreach ($f in (Get-ChildItem -Path $stage -File -Recurse | Sort-Object FullName)) {
  $rel = $f.FullName.Substring($stage.Length).TrimStart('\').Replace('\', '/')
  $h = (Get-FileHash -Path $f.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
  $files += [ordered]@{ path = $rel; bytes = $f.Length; sha256 = $h }
}
$manifest = [ordered]@{
  name = 'simo'; version = $Version; platform = 'windows-amd64'; buildTime = $buildTime
  exeSha256 = $exeHash; files = $files
} | ConvertTo-Json -Depth 5
Set-Content -Path (Join-Path $stage 'manifest.json') -Value $manifest -Encoding UTF8

# ---------------------------------------------------------------- zip + checksum
$zipName = 'simo-' + $Version + '-win-x64.zip'
$zipPath = Join-Path $OutDir $zipName
if ((Test-Path $zipPath) -and -not $Force) { Fail "output already exists: $zipPath (use -Force to overwrite)" }
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

if ($NoZip) {
  Write-Step "zip skipped (-NoZip); staged files: $stage"
} else {
  if (Test-Path $zipPath) { Remove-Item -Path $zipPath -Force }
  Write-Step "creating zip ..."
  Compress-Archive -Path (Join-Path $stage '*') -DestinationPath $zipPath -CompressionLevel Optimal
  $zipHash = (Get-FileHash -Path $zipPath -Algorithm SHA256).Hash.ToLowerInvariant()
  $shaPath = $zipPath + '.sha256'
  Set-Content -Path $shaPath -Value ($zipHash + '  ' + $zipName) -Encoding ASCII
  $zipItem = Get-Item $zipPath
  Write-Step "zip:     $zipPath ($([math]::Round($zipItem.Length / 1MB, 2)) MB)"
  Write-Step "sha256:  $zipHash  ($shaPath)"
}

Write-Step "exe sha256: $exeHash"
Write-Step "done."

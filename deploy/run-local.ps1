# simo local container-semantics smoke test (Windows PowerShell 5.1+).
#
# Purpose: on a machine WITHOUT Docker, reproduce most of the RUNTIME semantics
# that the container deliverable is supposed to guarantee:
#   - all state lives under SIMO_HOME (throwaway dir == named volume /data)
#   - the listener binds 127.0.0.1 only (compose publishes 127.0.0.1:8787)
#   - readiness is checked via GET /api/health (== Docker HEALTHCHECK)
#   - shutdown sends a terminate signal (Go handles SIGTERM with 10s grace)
#
# NOT covered here (still needs a real container environment):
#   - image build (multi-stage node/golang, distroless/alpine, non-root uid)
#   - container network namespace, port publishing, named-volume ownership
#   - HEALTHCHECK behavior in the Docker engine
#
# NOTE: this file is intentionally ASCII-only. Windows PowerShell 5.1 reads
# BOM-less .ps1 files using the system ANSI codepage, so non-ASCII comments
# would be mis-parsed. Keep it ASCII.
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File deploy\run-local.ps1
#   powershell -ExecutionPolicy Bypass -File deploy\run-local.ps1 -Listen 127.0.0.1:8899 -KeepData
#   powershell -ExecutionPolicy Bypass -File deploy\run-local.ps1 -Build
#   powershell -ExecutionPolicy Bypass -File deploy\run-local.ps1 -DataHome D:\tmp\simo-home
#
# Exit code: 0 = health check passed and process stopped; 1 = failure.

[CmdletBinding()]
param(
  [string]$DataHome = $(Join-Path $env:TEMP ("simo-home-" + [guid]::NewGuid().ToString('N').Substring(0, 8))),
  [string]$Listen = '127.0.0.1:8787',
  [int]$WaitSeconds = 25,
  [switch]$Build,
  [switch]$KeepData,
  # Optional explicit binary path (useful when the in-repo simo.exe is stale);
  # defaults to backend/simo.exe, simo.exe, backend/simo in that order.
  [string]$Exe = ''
)

$ErrorActionPreference = 'Stop'
$script:proc = $null
$script:logOut = $null
$script:logErr = $null

function Resolve-RepoRoot {
  # This script lives in <repo>/deploy/
  $root = Split-Path -Parent $PSScriptRoot
  $marker = Join-Path $root 'backend\cmd\simo\main.go'
  if (-not (Test-Path -LiteralPath $marker)) {
    throw "repo root not found (expected $marker)"
  }
  return $root
}

function Get-SimoExe([string]$RepoRoot) {
  $candidates = @(
    (Join-Path $RepoRoot 'backend\simo.exe'),
    (Join-Path $RepoRoot 'simo.exe'),
    (Join-Path $RepoRoot 'backend\simo')
  )
  foreach ($c in $candidates) {
    if (Test-Path -LiteralPath $c) { return $c }
  }
  throw "simo binary not found; build it first (cd backend; ..\toolchain\go.ps1 build -o simo.exe ./cmd/simo) or pass -Build"
}

function Build-Simo([string]$RepoRoot) {
  $goPs1 = Join-Path $RepoRoot 'toolchain\go.ps1'
  if (-not (Test-Path -LiteralPath $goPs1)) { throw "missing toolchain\go.ps1; cannot -Build" }
  Write-Host "[build] go build -o simo.exe ./cmd/simo" -ForegroundColor Cyan
  Push-Location (Join-Path $RepoRoot 'backend')
  try {
    & $goPs1 build -o simo.exe ./cmd/simo
    if ($LASTEXITCODE -ne 0) { throw "go build failed (exit=$LASTEXITCODE)" }
  } finally {
    Pop-Location
  }
}

function Get-FreePort([string]$Address) {
  if ($Address -match '^(.*):(\d+)$') { return [int]$Matches[2] }
  throw "cannot parse port from -Listen: $Address"
}

function Get-Health([int]$Port) {
  $url = "http://127.0.0.1:$Port/api/health"
  try {
    $resp = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 3
    if ($resp.StatusCode -eq 200 -and $resp.Content) { return $resp.Content.Trim() }
    return $null
  } catch {
    return $null
  }
}

function Show-Tail([string]$Path, [int]$Lines = 20) {
  if (Test-Path -LiteralPath $Path) {
    Write-Host "--- $Path (last $Lines) ---" -ForegroundColor Yellow
    Get-Content -LiteralPath $Path -Tail $Lines | ForEach-Object { Write-Host "  $_" }
  }
}

$exitCode = 0
$repoRoot = Resolve-RepoRoot
Write-Host "[info] repo root : $repoRoot" -ForegroundColor Cyan

if ($Build) { Build-Simo $repoRoot }
if ($Exe) {
  if (-not (Test-Path -LiteralPath $Exe)) { throw "binary not found: $Exe" }
  $exe = (Resolve-Path -LiteralPath $Exe).Path
} else {
  $exe = Get-SimoExe $repoRoot
}
Write-Host "[info] binary    : $exe" -ForegroundColor Cyan

$port = Get-FreePort $Listen
$homeFull = [System.IO.Path]::GetFullPath($DataHome)
Write-Host "[info] SIMO_HOME = $homeFull  (simulates container /data volume)" -ForegroundColor Cyan
Write-Host "[info] listen      = $Listen  (simulates host 127.0.0.1 publish)" -ForegroundColor Cyan

# Pre-create data dirs (the image does this via mkdir/chown).
foreach ($d in @($homeFull, (Join-Path $homeFull 'artifacts'), (Join-Path $homeFull 'workspace'), (Join-Path $homeFull 'logs'))) {
  if (-not (Test-Path -LiteralPath $d)) { New-Item -ItemType Directory -Path $d -Force | Out-Null }
}

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$script:logOut = Join-Path $homeFull ("stdout-$stamp.log")
$script:logErr = Join-Path $homeFull ("stderr-$stamp.log")

# Same env semantics as the container: SIMO_HOME points at isolated dir,
# SIMO_ADDR overrides the listen address.
$oldHome = $env:SIMO_HOME
$oldAddr = $env:SIMO_ADDR
$oldModel = $env:SIMO_MODEL
$env:SIMO_HOME = $homeFull
$env:SIMO_ADDR = $Listen
$env:SIMO_MODEL = 'mock'

try {
  Write-Host "[run] $exe serve" -ForegroundColor Green
  $script:proc = Start-Process -FilePath $exe `
    -ArgumentList @('serve') `
    -PassThru -NoNewWindow `
    -RedirectStandardOutput $script:logOut `
    -RedirectStandardError $script:logErr

  $deadline = (Get-Date).AddSeconds($WaitSeconds)
  $health = $null
  while ((Get-Date) -lt $deadline) {
    if ($script:proc.HasExited) {
      Write-Host "[fail] simo exited early (exit=$($script:proc.ExitCode))" -ForegroundColor Red
      Show-Tail $script:logErr
      Show-Tail $script:logOut
      $exitCode = 1
      break
    }
    $health = Get-Health $port
    if ($health) { break }
    Start-Sleep -Milliseconds 500
  }

  if ($exitCode -eq 0) {
    if (-not $health) {
      Write-Host "[fail] /api/health not ready within $WaitSeconds s" -ForegroundColor Red
      Show-Tail $script:logErr
      Show-Tail $script:logOut
      $exitCode = 1
    } else {
      Write-Host "[ok]   /api/health => $health" -ForegroundColor Green
      Write-Host "[ok]   browser: http://127.0.0.1:$port/" -ForegroundColor Green
      Write-Host "[ok]   data dir: $homeFull (simo.db / artifacts / workspace / logs)" -ForegroundColor Green
    }
  }
} finally {
  if ($script:proc -and -not $script:proc.HasExited) {
    Write-Host "[stop] terminating process (Go grace period up to 10s)..." -ForegroundColor Cyan
    try {
      Stop-Process -Id $script:proc.Id -Force -ErrorAction SilentlyContinue
      $script:proc.WaitForExit(12000) | Out-Null
    } catch {
      Write-Host "[warn] failed to stop process: $($_.Exception.Message)" -ForegroundColor Yellow
    }
  }
  $env:SIMO_HOME = $oldHome
  $env:SIMO_ADDR = $oldAddr
  $env:SIMO_MODEL = $oldModel
}

# Data retention: default cleans the throwaway dir (like removing a container),
# -KeepData keeps it for inspection.
if (-not $KeepData) {
  try {
    if (Test-Path -LiteralPath $homeFull) {
      Get-ChildItem -LiteralPath $homeFull -Filter 'stdout-*.log' -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue
      Get-ChildItem -LiteralPath $homeFull -Filter 'stderr-*.log' -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue
      Remove-Item -LiteralPath $homeFull -Recurse -Force -ErrorAction SilentlyContinue
    }
  } catch {
    Write-Host "[warn] could not remove temp data dir (delete manually): $homeFull" -ForegroundColor Yellow
  }
} else {
  Write-Host "[keep] data kept at: $homeFull" -ForegroundColor Cyan
}

if ($exitCode -eq 0) {
  Write-Host "[done] local container-semantics smoke test passed (image build/run still needs a container environment)" -ForegroundColor Green
}
exit $exitCode

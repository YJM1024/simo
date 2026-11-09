#requires -Version 5.1
<#
.SYNOPSIS
  Build the simo container image (multi-stage: web + Go + runtime).
.DESCRIPTION
  If Docker is not installed, prints a clear message and exits 2.
  Build context is always the repository root (needs frontend/ and backend/).
.PARAMETER Tag
  Image tag. Default: simo:local
.PARAMETER Platform
  Optional docker platform, for example linux/amd64.
.PARAMETER Distroless
  Build the optional distroless runtime (no shell/wget, no built-in HEALTHCHECK).
.PARAMETER NoCache
  Disable Docker layer cache.
.PARAMETER DryRun
  Print the command only; no Docker required. Useful for static validation.
#>
[CmdletBinding()]
param(
    [string]$Tag = "simo:local",
    [string]$Platform = "",
    [switch]$Distroless,
    [switch]$NoCache,
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"
$deployDir = $PSScriptRoot
$repoRoot = Split-Path -Parent $deployDir
$dockerfile = Join-Path $deployDir "Dockerfile"

if (-not (Test-Path -LiteralPath $dockerfile)) {
    Write-Host "Dockerfile not found: $dockerfile" -ForegroundColor Red
    exit 1
}
if (-not (Test-Path -LiteralPath (Join-Path $repoRoot "backend\go.mod"))) {
    Write-Host "Incomplete build context: backend\go.mod is missing (repo root=$repoRoot)" -ForegroundColor Red
    exit 1
}
if (-not (Test-Path -LiteralPath (Join-Path $repoRoot "frontend\package.json"))) {
    Write-Host "Incomplete build context: frontend\package.json is missing" -ForegroundColor Red
    exit 1
}

$buildArgs = @(
    "build",
    "-f", $dockerfile,
    "-t", $Tag
)
if ($Platform -ne "") {
    $buildArgs += @("--platform", $Platform)
}
if ($Distroless) {
    $buildArgs += @("--target", "runtime-distroless")
}
if ($NoCache) {
    $buildArgs += "--no-cache"
}
$buildArgs += $repoRoot

if ($DryRun) {
    Write-Host "DryRun: command (build context: $repoRoot)" -ForegroundColor Cyan
    Write-Host ("docker " + ($buildArgs -join " "))
    exit 0
}

$docker = Get-Command docker -ErrorAction SilentlyContinue
if ($null -eq $docker) {
    Write-Host "Docker was not found." -ForegroundColor Yellow
    Write-Host "This script builds the image only; it will not install Docker/WSL/Podman." -ForegroundColor Yellow
    Write-Host "Install Docker Desktop (Windows) or Docker Engine, then rerun:" -ForegroundColor Yellow
    Write-Host "  pwsh -NoProfile -File deploy/docker-build.ps1 -Tag $Tag" -ForegroundColor Yellow
    Write-Host "No-container local run: deploy/run-local.ps1 (does not touch port 8787)." -ForegroundColor Yellow
    exit 2
}

Write-Host "Building image $Tag (context: $repoRoot)" -ForegroundColor Cyan
Write-Host ("docker " + ($buildArgs -join " "))
& $docker.Source @buildArgs
$code = $LASTEXITCODE
if ($code -ne 0) {
    Write-Host "Image build failed, docker exit=$code" -ForegroundColor Red
    exit $code
}
Write-Host "Build complete: $Tag" -ForegroundColor Green
Write-Host "Start: docker compose -f deploy/compose.yaml up -d"
Write-Host "Check: docker compose -f deploy/compose.yaml ps (wait for healthy)"
exit 0

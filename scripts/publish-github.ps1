# Publish Simo source to GitHub
#
# Run this from the workspace root with Git installed:
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\publish-github.ps1 -RepoUrl https://github.com/<user>/<repo>.git
#
# Optional:
#   -Token <github_pat>    use a PAT for HTTPS push (or set $env:GITHUB_TOKEN)
#   -Branch main           target branch (default main)
#   -Tag v1.0.0            create and push a git tag
#   -DryRun                initialize + commit locally only, don't push
#
# Safety:
#   - .gitignore excludes backend/config.local.json, data/, .tmp/, *.exe, deploy/dist/
#   - refuses to run if a tracked secret-looking file is about to be committed
#   - ASCII only

param(
  [Parameter(Mandatory = $true)][string]$RepoUrl,
  [string]$Token = $env:GITHUB_TOKEN,
  [string]$Branch = 'main',
  [string]$Tag = '',
  [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
function Info([string]$m) { Write-Host ("[publish] " + $m) }
function Fail([string]$m) { Write-Host ("[publish] ERROR: " + $m); exit 1 }

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  Fail "git not found. Install Git for Windows first (winget install --id Git.Git -e), reopen the terminal, then rerun this script."
}

if (-not (Test-Path '.gitignore')) { Fail ".gitignore missing; run this from the repo root" }

# ---- safety: no secrets in the index
$forbidden = @('backend/config.local.json', 'data/simo.db')
foreach ($f in $forbidden) {
  if (Test-Path $f) { Info ("excluded by .gitignore: " + $f) }
}

if (-not (Test-Path '.git')) {
  Info "initializing repository"
  git init -b $Branch | Out-Host
}
git add -A
$staged = git status --short
if ($staged -match 'config\.local\.json|data/backend\.db|\.env') {
  Fail "refusing to commit: a secret-looking file is staged. Check .gitignore."
}
Info "staged files:"
git status --short | Select-Object -First 40 | Out-Host

git -c user.name='Simo Builder' -c user.email='simo@localhost' commit -m 'Simo M1-M41: agent runtime, memory, team, workflows, view schema, interactive cards' | Out-Host
if ($Tag) {
  git tag -f $Tag | Out-Host
  Info ("tagged " + $Tag)
}

if ($DryRun) { Info "dry run: local commit only, not pushing"; exit 0 }

# ---- remote + push
try { git remote remove origin 2>$null | Out-Null } catch { }
try { git remote add origin $RepoUrl } catch { }
$pushUrl = $RepoUrl
if ($Token -and $RepoUrl -match '^https://github\.com/') {
  $pushUrl = $RepoUrl -replace '^https://', ('https://x-access-token:' + $Token + '@')
}
Info ("pushing to " + ($RepoUrl -replace '//[^@]+@','//***@'))
git push -u $pushUrl "HEAD:$Branch" | Out-Host
if ($Tag) { git push $pushUrl $Tag --force | Out-Host }

Info "done."
Info "next: add repository secrets: DEEPSEEK_API_KEY (for real-smoke CI job), and enable Actions."

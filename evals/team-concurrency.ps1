# team-concurrency.ps1 -- M23 team V0 concurrency limits (env-driven)
#
# Starts the server with SIMO_MAX_CONCURRENCY=1 and SIMO_WORKFLOW_CONCURRENCY=1,
# launches two mock workflows, then asserts:
#   - /api/team reports globalConcurrency=1 / workflowConcurrency=1
#   - at every sample, the number of running tasks is <= 1
#   - at least one task is queued with a non-empty stateReason (concurrency queue)
# Owns its own port + temp SIMO_HOME; never touches 8787.
#
# Usage: powershell -NoProfile -ExecutionPolicy Bypass -File evals/team-concurrency.ps1 [-Exe path] [-Port 18914]
# NOTE: keep this file ASCII-only (Windows PowerShell 5.1 misreads UTF-8 without BOM).

param(
  [string]$Exe = '',
  [int]$Port = 18914
)

$ErrorActionPreference = 'Stop'
$script:total = 0
$script:failures = @()

function Add-Check([string]$name, [bool]$ok, [string]$note) {
  $script:total++
  $mark = if ($ok) { 'PASS' } else { 'FAIL' }
  Write-Host ("[{0}] {1}: {2}" -f $mark, $name, $note)
  if (-not $ok) { $script:failures += $name }
}

$repo = Split-Path -Parent $PSScriptRoot
if (-not $Exe) { $Exe = Join-Path $repo 'backend\simo.exe' }
if (-not (Test-Path $Exe)) { Write-Host "FAIL: exe not found: $Exe"; exit 2 }

$work = Join-Path ([System.IO.Path]::GetTempPath()) ("simo-teamconc-" + [guid]::NewGuid().ToString('N').Substring(0, 8))
$homeDir = Join-Path $work 'home'
New-Item -ItemType Directory -Force -Path $homeDir | Out-Null
$base = "http://127.0.0.1:$Port"

Write-Host "workdir: $work"
Write-Host "exe: $Exe"
Write-Host "port: $Port (SIMO_MAX_CONCURRENCY=1, SIMO_WORKFLOW_CONCURRENCY=1)"
Write-Host ''

$env:SIMO_HOME = $homeDir
$env:SIMO_LLM = 'mock'
$env:SIMO_DEBUG = '1'
$env:SIMO_MAX_CONCURRENCY = '1'
$env:SIMO_WORKFLOW_CONCURRENCY = '1'

$log = Join-Path $work 'server.log'
$proc = Start-Process -FilePath $Exe -ArgumentList 'serve', '-addr', ("127.0.0.1:" + $Port), '-debug' `
  -RedirectStandardOutput $log -RedirectStandardError ($log + '.err') -WindowStyle Hidden -PassThru
$deadline = (Get-Date).AddSeconds(25)
$ready = $false
while ((Get-Date) -lt $deadline) {
  try {
    if ((Invoke-WebRequest ($base + '/api/health') -TimeoutSec 2 -UseBasicParsing).StatusCode -eq 200) { $ready = $true; break }
  } catch { Start-Sleep -Milliseconds 300 }
}
Add-Check 'Backend starts with concurrency env' $ready $(if ($ready) { $base } else { 'no /api/health in 25s' })
if (-not $ready) { Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue; exit 1 }

function Get-Json([string]$path) {
  return (Invoke-WebRequest ($base + $path) -TimeoutSec 20 -UseBasicParsing).Content | ConvertFrom-Json
}
function Post-Json([string]$path, [hashtable]$body) {
  return ((Invoke-WebRequest ($base + $path) -Method Post -Body ($body | ConvertTo-Json -Depth 5) `
      -ContentType 'application/json' -UseBasicParsing).Content | ConvertFrom-Json)
}

$tag = [guid]::NewGuid().ToString('N').Substring(0, 8)
$s1 = Post-Json '/api/sessions' @{ title = "teamconc-a-$tag" }
$s2 = Post-Json '/api/sessions' @{ title = "teamconc-b-$tag" }
$sid1 = [string]$s1.session.id
$sid2 = [string]$s2.session.id
$null = Post-Json '/api/chat' @{ sessionId = $sid1; text = "evals-teamconc-$tag mock:workflow" }
$null = Post-Json '/api/chat' @{ sessionId = $sid2; text = "evals-teamconc-$tag mock:workflow" }

$team = Get-Json '/api/team'
Add-Check 'Team reports globalConcurrency=1' ([int]$team.globalConcurrency -eq 1) ("globalConcurrency=" + $team.globalConcurrency)
Add-Check 'Team reports workflowConcurrency=1' ([int]$team.workflowConcurrency -eq 1) ("workflowConcurrency=" + $team.workflowConcurrency)

$maxRunning = 0
$sawQueued = $false
$queuedReason = ''
$deadline = (Get-Date).AddSeconds(45)
while ((Get-Date) -lt $deadline) {
  try {
    $tasks = Get-Json ('/api/tasks')
    $all = @($tasks.tasks)
    $running = @($all | Where-Object { [string]$_.status -eq 'running' }).Count
    if ($running -gt $maxRunning) { $maxRunning = $running }
    $queued = @($all | Where-Object { [string]$_.status -eq 'queued' })
    if ($queued.Count -ge 1) {
      $sawQueued = $true
      $queuedReason = [string]$queued[0].stateReason
    }
  } catch { }
  Start-Sleep -Milliseconds 500
}

Add-Check 'Running tasks never exceed 1' ($maxRunning -le 1 -and $maxRunning -ge 1) ("maxRunning=" + $maxRunning)
Add-Check 'At least one task queued under limit' $sawQueued 'queued task observed'
Add-Check 'Queued task has stateReason' (-not [string]::IsNullOrWhiteSpace($queuedReason)) ("reason=" + $queuedReason)

Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
Write-Host ''
$passed = $script:total - $script:failures.Count
Write-Host ("TEAM CONCURRENCY SUMMARY: {0}/{1} PASS" -f $passed, $script:total)
if ($script:failures.Count -gt 0) { Write-Host ("FAILED: " + ($script:failures -join '; ')) }
Write-Host "workdir: $work"
if ($script:failures.Count -gt 0) { exit 1 } else { exit 0 }

# team-executor.ps1 -- M23 task executor config (default agent:task-npc -> AGENTD_TASK_EXECUTOR=agent:simo)
#
# Phase 1: start with default env; /api/team members must report agentId=agent:task-npc.
# Phase 2: restart with AGENTD_TASK_EXECUTOR=agent:simo; members must report agentId=agent:simo.
# Owns its own port + temp AGENTD_HOME; never touches 8787.
#
# Usage: powershell -NoProfile -ExecutionPolicy Bypass -File evals/team-executor.ps1 [-Exe path] [-Port 18915]
# NOTE: keep this file ASCII-only (Windows PowerShell 5.1 misreads UTF-8 without BOM).

param(
  [string]$Exe = '',
  [int]$Port = 18915
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
if (-not $Exe) { $Exe = Join-Path $repo 'agentd\simo.exe' }
if (-not (Test-Path $Exe)) { Write-Host "FAIL: exe not found: $Exe"; exit 2 }

$work = Join-Path ([System.IO.Path]::GetTempPath()) ("agentd-teamexec-" + [guid]::NewGuid().ToString('N').Substring(0, 8))
$homeDir = Join-Path $work 'home'
New-Item -ItemType Directory -Force -Path $homeDir | Out-Null
$base = "http://127.0.0.1:$Port"

Write-Host "workdir: $work"
Write-Host "exe: $Exe"
Write-Host "port: $Port"
Write-Host ''

$env:AGENTD_HOME = $homeDir
$env:AGENTD_LLM = 'mock'
$env:AGENTD_DEBUG = '1'

function Start-Backend([string]$label, [hashtable]$extraEnv) {
  foreach ($k in $extraEnv.Keys) { Set-Item -Path ("env:" + $k) -Value ([string]$extraEnv[$k]) }
  if (-not $extraEnv.ContainsKey('AGENTD_TASK_EXECUTOR')) { Remove-Item -Path 'env:AGENTD_TASK_EXECUTOR' -ErrorAction SilentlyContinue }
  $log = Join-Path $work ($label + '.log')
  $p = Start-Process -FilePath $Exe -ArgumentList 'serve', '-addr', ("127.0.0.1:" + $Port), '-debug' `
    -RedirectStandardOutput $log -RedirectStandardError ($log + '.err') -WindowStyle Hidden -PassThru
  $deadline = (Get-Date).AddSeconds(25)
  while ((Get-Date) -lt $deadline) {
    try {
      if ((Invoke-WebRequest ($base + '/api/health') -TimeoutSec 2 -UseBasicParsing).StatusCode -eq 200) {
        return [pscustomobject]@{ Proc = $p; Ready = $true }
      }
    } catch { Start-Sleep -Milliseconds 300 }
  }
  return [pscustomobject]@{ Proc = $p; Ready = $false }
}
function Stop-Backend($h) {
  if ($h -and $h.Proc) { Stop-Process -Id $h.Proc.Id -Force -ErrorAction SilentlyContinue }
  Start-Sleep -Milliseconds 600
}
function Get-Json([string]$path) {
  return (Invoke-WebRequest ($base + $path) -TimeoutSec 20 -UseBasicParsing).Content | ConvertFrom-Json
}
function Post-Json([string]$path, [hashtable]$body) {
  return ((Invoke-WebRequest ($base + $path) -Method Post -Body ($body | ConvertTo-Json -Depth 5) `
      -ContentType 'application/json' -UseBasicParsing).Content | ConvertFrom-Json)
}
function Wait-Members([string]$sid, [int]$timeoutSec) {
  $deadline = (Get-Date).AddSeconds($timeoutSec)
  while ((Get-Date) -lt $deadline) {
    try {
      $t = Get-Json ('/api/team?sessionId=' + $sid)
      $members = @($t.members)
      if ($members.Count -ge 1) { return $members }
    } catch { }
    Start-Sleep -Milliseconds 500
  }
  return @()
}

# ---------------------------------------------------------------- phase 1: default executor
$s1 = Start-Backend 'default' @{}
Add-Check 'Backend starts (default executor)' $s1.Ready $(if ($s1.Ready) { $base } else { 'no /api/health' })
if (-not $s1.Ready) { Stop-Backend $s1; exit 1 }
$tag = [guid]::NewGuid().ToString('N').Substring(0, 8)
$sess = Post-Json '/api/sessions' @{ title = "teamexec-$tag" }
$sid = [string]$sess.session.id
$null = Post-Json '/api/chat' @{ sessionId = $sid; text = "evals-teamexec-$tag mock:workflow" }
$members = Wait-Members $sid 30
$agentIds1 = @($members | ForEach-Object { [string]$_.agentId } | Select-Object -Unique)
Add-Check 'Default executor is agent:task-npc' (($agentIds1.Count -ge 1) -and ($agentIds1 -contains 'agent:task-npc')) ("agentIds=" + ($agentIds1 -join ','))
Stop-Backend $s1

# ---------------------------------------------------------------- phase 2: AGENTD_TASK_EXECUTOR=agent:simo
$s2 = Start-Backend 'simo' @{ AGENTD_TASK_EXECUTOR = 'agent:simo' }
Add-Check 'Backend restarts with AGENTD_TASK_EXECUTOR=agent:simo' $s2.Ready $(if ($s2.Ready) { $base } else { 'no /api/health' })
if (-not $s2.Ready) { Stop-Backend $s2; exit 1 }
$tag2 = [guid]::NewGuid().ToString('N').Substring(0, 8)
$sess2 = Post-Json '/api/sessions' @{ title = "teamexec2-$tag2" }
$sid2 = [string]$sess2.session.id
$null = Post-Json '/api/chat' @{ sessionId = $sid2; text = "evals-teamexec2-$tag2 mock:workflow" }
$members2 = Wait-Members $sid2 30
$agentIds2 = @($members2 | ForEach-Object { [string]$_.agentId } | Select-Object -Unique)
Add-Check 'Executor override is agent:simo' (($agentIds2.Count -ge 1) -and ($agentIds2 -contains 'agent:simo')) ("agentIds=" + ($agentIds2 -join ','))
Stop-Backend $s2

Write-Host ''
$passed = $script:total - $script:failures.Count
Write-Host ("TEAM EXECUTOR SUMMARY: {0}/{1} PASS" -f $passed, $script:total)
if ($script:failures.Count -gt 0) { Write-Host ("FAILED: " + ($script:failures -join '; ')) }
Write-Host "workdir: $work"
if ($script:failures.Count -gt 0) { exit 1 } else { exit 0 }

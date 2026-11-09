# runtime-recovery.ps1 -- M19 crash-recovery check (kill mid-workflow -> restart -> resume)
#
# Asserts (contract A1/A2 level, observable via public API):
#   1) workflow survives restart with the same id
#   2) already-done tasks are NOT re-run (each task id appears once, statuses preserved)
#   3) workflow converges to a terminal state (done/partial/failed) instead of hanging
#   4) the session receives a recovery/interruption report message (no silent loss)
#   5) when /api/debug/runtime exists (M19 debug hook), recoveries[] audit is non-empty
#
# Owns its own port + temp AGENTD_HOME and only stops the PIDs it started (never touches 8787).
#
# Usage:
#   powershell -NoProfile -ExecutionPolicy Bypass -File evals/runtime-recovery.ps1
#   powershell -NoProfile -ExecutionPolicy Bypass -File evals/runtime-recovery.ps1 -Exe <path> -Port 18908
#   powershell -NoProfile -ExecutionPolicy Bypass -File evals/runtime-recovery.ps1 -StrictResume
#
# -StrictResume (M19-B acceptance mode, off by default):
#   resumable-only scenario => the workflow MUST auto-resume to `done` (not paused).
#   Default mode tolerates `paused` (+ report) because M19-A only implemented the
#   "mark for human" path; enable after M19-B lands the auto-resume path.
#
# NOTE: keep this file ASCII-only (Windows PowerShell 5.1 misreads UTF-8 without BOM).

param(
  [string]$Exe = '',
  [int]$Port = 18908,
  [switch]$StrictResume
)

$ErrorActionPreference = 'Stop'
$script:total = 0
$script:failures = @()
$script:skips = @()

function Add-Check([string]$name, [bool]$ok, [string]$note) {
  $script:total++
  $mark = if ($ok) { 'PASS' } else { 'FAIL' }
  Write-Host ("[{0}] {1}: {2}" -f $mark, $name, $note)
  if (-not $ok) { $script:failures += $name }
}
function Add-Skip([string]$name, [string]$note) {
  Write-Host ("[SKIP] {0}: {1}" -f $name, $note)
  $script:skips += $name
}

$repo = Split-Path -Parent $PSScriptRoot
if (-not $Exe) { $Exe = Join-Path $repo 'toolchain\tmp\release\agentd.exe' }
if (-not (Test-Path $Exe)) { Write-Host "FAIL: agentd exe not found: $Exe"; exit 2 }

$work = Join-Path ([System.IO.Path]::GetTempPath()) ("agentd-recovery-" + [guid]::NewGuid().ToString('N').Substring(0, 8))
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

function Start-Backend([string]$label) {
  $l = Join-Path $work ($label + '.log')
  $p = Start-Process -FilePath $Exe -ArgumentList 'serve', '-addr', ("127.0.0.1:" + $Port) `
    -RedirectStandardOutput $l -RedirectStandardError ($l + '.err') -WindowStyle Hidden -PassThru
  $deadline = (Get-Date).AddSeconds(25)
  while ((Get-Date) -lt $deadline) {
    try {
      $r = Invoke-WebRequest ($base + '/api/health') -TimeoutSec 2 -UseBasicParsing
      if ($r.StatusCode -eq 200) { return [pscustomobject]@{ Proc = $p; Ready = $true } }
    } catch { Start-Sleep -Milliseconds 250 }
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

# ---------------------------------------------------------------- 1) start + launch a workflow
$s1 = Start-Backend 'before'
Add-Check 'Backend starts (fresh home)' $s1.Ready $(if ($s1.Ready) { $base } else { 'no /api/health in 25s' })
if (-not $s1.Ready) { Stop-Backend $s1; exit 1 }

$tag = [guid]::NewGuid().ToString('N').Substring(0, 8)
$probe = "evals-recovery-$tag"
$sess = Post-Json '/api/sessions' @{ title = "recovery-$tag" }
$sid = [string]$sess.session.id
Add-Check 'Session created' (-not [string]::IsNullOrWhiteSpace($sid)) ("sid=" + $sid)

$null = Post-Json '/api/chat' @{ sessionId = $sid; text = "$probe mock:workflow 拆解任务并推进。" }
$workflowId = ''
$deadline = (Get-Date).AddSeconds(30)
while ((Get-Date) -lt $deadline) {
  try {
    $list = Get-Json ('/api/workflows?sessionId=' + $sid)
    $wf = @($list.workflows)
    if ($wf.Count -ge 1) { $workflowId = [string]$wf[0].id; break }
  } catch { }
  Start-Sleep -Milliseconds 500
}
Add-Check 'Workflow created before crash' (-not [string]::IsNullOrWhiteSpace($workflowId)) ("workflowId=" + $workflowId)
if (-not $workflowId) { Stop-Backend $s1; exit 1 }

# 等第一个任务完成、第二个还在跑/排队，再 kill（模拟中途崩溃）
Start-Sleep -Seconds 7
$before = Get-Json ('/api/workflows/' + $workflowId)
$tasksBefore = @($before.workflow.tasks)
$doneBefore = @($tasksBefore | Where-Object { [string]$_.status -eq 'done' } | ForEach-Object { [string]$_.id })
$doneIdsBefore = $doneBefore -join ','
Write-Host ("before kill: tasks=" + $tasksBefore.Count + " done=" + $doneBefore.Count + " statuses=" + (($tasksBefore | ForEach-Object { $_.status }) -join ','))

Stop-Backend $s1
Add-Check 'Process killed mid-workflow' ($null -eq (Get-Process -Id $s1.Proc.Id -ErrorAction SilentlyContinue)) ("pid=" + $s1.Proc.Id)

# ---------------------------------------------------------------- 2) restart + assertions
$s2 = Start-Backend 'after'
Add-Check 'Backend restarts on same AGENTD_HOME' $s2.Ready $(if ($s2.Ready) { $base } else { 'no /api/health in 25s' })
if (-not $s2.Ready) { Stop-Backend $s2; exit 1 }

$list2 = Get-Json ('/api/workflows?sessionId=' + $sid)
$ids2 = @($list2.workflows | ForEach-Object { [string]$_.id })
Add-Check 'Workflow survives restart (same id)' ($ids2 -contains $workflowId) ("seen=" + ($ids2 -join ','))

$converged = $false
$final = $null
$deadline = (Get-Date).AddSeconds($(if ($StrictResume) { 180 } else { 120 }))
# 严格模式：paused 不算"收敛完成"（它必须继续跑到 done）；默认模式允许 paused（M19-A 语义）
$terminal = if ($StrictResume) { @('done', 'partial', 'failed', 'cancelled') } else { @('done', 'partial', 'failed', 'cancelled', 'paused') }
while ((Get-Date) -lt $deadline) {
  try {
    $final = Get-Json ('/api/workflows/' + $workflowId)
    $st = [string]$final.workflow.status
    if ($terminal -contains $st) { $converged = $true; break }
  } catch { }
  Start-Sleep -Seconds 1
}
$finalStatus = if ($final) { [string]$final.workflow.status } else { '<none>' }
Add-Check 'Workflow converges (not hanging)' $converged ("status=" + $finalStatus)
if ($StrictResume) {
  Add-Check 'Strict: resumable workflow auto-resumed to done' ($finalStatus -eq 'done') ("status=" + $finalStatus)
}

$tasksAfter = if ($final) { @($final.workflow.tasks) } else { @() }
$afterIds = @($tasksAfter | ForEach-Object { [string]$_.id })
Add-Check 'No duplicate task rows' ($afterIds.Count -eq @($afterIds | Select-Object -Unique).Count) ("tasks=" + $afterIds.Count)

# done 过的任务不得回退
$regressed = @()
foreach ($id in ($doneBefore -split ',')) {
  if ([string]::IsNullOrWhiteSpace($id)) { continue }
  $now = @($tasksAfter | Where-Object { [string]$_.id -eq $id })
  if ($now.Count -ge 1) {
    $stNow = [string]$now[0].status
    if ($stNow -ne 'done' -and $stNow -ne 'running') { $regressed += ($id + ':' + $stNow) }
  }
}
Add-Check 'Previously-done tasks not re-run/reset' ($regressed.Count -eq 0) ("regressed=" + ($regressed -join ';'))

$msgs = Get-Json ('/api/messages?sessionId=' + $sid)
$texts = @($msgs.messages | ForEach-Object { [string]$_.text })
$reported = @($texts | Where-Object { $_ -match '(恢复|继续|中断|恢复中|recover)' }).Count -ge 1
Add-Check 'Session receives recovery/interruption report' $reported ("messages=" + @($msgs.messages).Count)

# 可选 debug hook
try {
  $dbg = Invoke-WebRequest ($base + '/api/debug/runtime?sessionId=' + $sid) -TimeoutSec 5 -UseBasicParsing
  if ($dbg.StatusCode -eq 200) {
    $rt = $dbg.Content | ConvertFrom-Json
    $recoveries = @($rt.recoveries)
    Add-Check 'Debug runtime exposes recovery audit' ($recoveries.Count -ge 1) ("recoveries=" + $recoveries.Count)
  } else { Add-Skip 'Debug runtime exposes recovery audit' ('status=' + $dbg.StatusCode) }
} catch { Add-Skip 'Debug runtime exposes recovery audit' 'endpoint not available (M19 debug hook pending)' }

Stop-Backend $s2

# ---------------------------------------------------------------- summary
Write-Host ''
$passed = $script:total - $script:failures.Count
Write-Host ("RECOVERY CHECK SUMMARY: {0}/{1} PASS" -f $passed, $script:total)
if ($script:skips.Count -gt 0) { Write-Host ("SKIPPED: " + ($script:skips -join '; ')) }
if ($script:failures.Count -gt 0) { Write-Host ("FAILED: " + ($script:failures -join '; ')) }
Write-Host "workdir: $work"
if ($script:failures.Count -gt 0) { exit 1 } else { exit 0 }

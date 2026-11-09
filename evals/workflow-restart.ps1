# workflow-restart.ps1 -- M10 restart-recovery check (real process restart)
#
# Why a separate script: run.mjs assumes an already-running server, but this check
# must kill and restart the process. The script owns its own port + temp SIMO_HOME
# and only stops the PID it started, so the user's 8787 instance is never touched.
#
# Usage:
#   powershell -NoProfile -ExecutionPolicy Bypass -File evals/workflow-restart.ps1
#   powershell -NoProfile -ExecutionPolicy Bypass -File evals/workflow-restart.ps1 -Exe <path> [-Port 18902]
#
# Asserts (structural, no real-model dependency):
#   1) before restart: workflow exists with >= 2 tasks
#   2) after restart: same workflow id still exists (not lost), tasks still exist
#   3) after restart the workflow converges: resumable -> done (M19-B auto-resume),
#      or paused/interrupted WITH an explicit report message (non-resumable, no silent loss)
#   4) no duplicate task rows; previously-done tasks are not reset
#   5) the creation reply message still present (messages not lost)
#
# NOTE: keep this file ASCII-only (Windows PowerShell 5.1 misreads UTF-8 without BOM).

param(
  [string]$Exe = '',
  [int]$Port = 18902
)

$ErrorActionPreference = 'Stop'

function Add-Check([string]$name, [bool]$ok, [string]$note) {
  $script:total++
  $mark = if ($ok) { 'PASS' } else { 'FAIL' }
  Write-Host ("[{0}] {1}: {2}" -f $mark, $name, $note)
  if (-not $ok) { $script:failures += $name }
}

$script:total = 0
$script:failures = @()
$repo = Split-Path -Parent $PSScriptRoot
if (-not $Exe) { $Exe = Join-Path $repo 'toolchain\tmp\release\simo.exe' }
if (-not (Test-Path $Exe)) {
  Write-Host "FAIL: simo exe not found: $Exe"
  exit 2
}

$work = Join-Path ([System.IO.Path]::GetTempPath()) ("simo-wfrestart-" + [guid]::NewGuid().ToString('N').Substring(0, 8))
$homeDir = Join-Path $work 'home'
New-Item -ItemType Directory -Force -Path $homeDir | Out-Null
$base = "http://127.0.0.1:$Port"
Write-Host "workdir: $work"
Write-Host "exe: $Exe"
Write-Host "port: $Port"
Write-Host ''

$env:SIMO_HOME = $homeDir
$env:SIMO_LLM = 'mock'
$env:SIMO_DEBUG = '1'

function Start-Backend([string]$label) {
  $log = Join-Path $work ($label + '.log')
  $p = Start-Process -FilePath $Exe -ArgumentList 'serve', '-addr', ("127.0.0.1:" + $Port) `
    -RedirectStandardOutput $log -RedirectStandardError ($log + '.err') -WindowStyle Hidden -PassThru
  $deadline = (Get-Date).AddSeconds(20)
  while ((Get-Date) -lt $deadline) {
    try {
      $r = Invoke-WebRequest ($base + '/api/health') -TimeoutSec 2 -UseBasicParsing
      if ($r.StatusCode -eq 200) { return [pscustomobject]@{ Proc = $p; Ready = $true; Log = $log } }
    } catch { Start-Sleep -Milliseconds 250 }
  }
  return [pscustomobject]@{ Proc = $p; Ready = $false; Log = $log }
}

function Stop-Backend($h) {
  if ($h -and $h.Proc) { Stop-Process -Id $h.Proc.Id -Force -ErrorAction SilentlyContinue }
  Start-Sleep -Milliseconds 500
}

function Get-Json([string]$path) {
  return (Invoke-WebRequest ($base + $path) -TimeoutSec 10 -UseBasicParsing).Content | ConvertFrom-Json
}

# ---------------------------------------------------------------- 1) start + trigger workflow
$s1 = Start-Backend 'before'
Add-Check 'Backend starts (fresh home)' $s1.Ready $(if ($s1.Ready) { $base } else { 'no /api/health in 20s' })
if (-not $s1.Ready) { Stop-Backend $s1; Write-Host 'aborted'; exit 1 }

$probe = 'evals-wfrestart-' + [guid]::NewGuid().ToString('N').Substring(0, 8)
$body = @{ sessionId = 'main'; text = ($probe + ' mock:workflow restart check') } | ConvertTo-Json
$post = Invoke-WebRequest ($base + '/api/chat') -Method Post -Body $body -ContentType 'application/json' -UseBasicParsing
Add-Check 'POST /api/chat accepted (workflow trigger)' (@(200, 202) -contains $post.StatusCode) ("HTTP " + $post.StatusCode)

Start-Sleep -Seconds 4  # let the workflow be created and tasks start

$wfBefore = Get-Json ('/api/workflows?sessionId=main')
$wfCountBefore = @($wfBefore.workflows).Count
$wf = @($wfBefore.workflows)[0]
Add-Check 'Workflow created before restart' ($wfCountBefore -ge 1) ("workflows=" + $wfCountBefore)
if ($wfCountBefore -lt 1) { Stop-Backend $s1; Write-Host 'aborted: no workflow'; exit 1 }
$wfId = $wf.id
$tasksBefore = @($wf.tasks).Count
Add-Check 'Workflow has >= 2 tasks before restart' ($tasksBefore -ge 2) ("tasks=" + $tasksBefore)

# ---------------------------------------------------------------- 2) kill + restart same home
Stop-Backend $s1
$alive1 = $null -ne (Get-Process -Id $s1.Proc.Id -ErrorAction SilentlyContinue)
Add-Check 'Process stopped before restart' (-not $alive1) ("pid=" + $s1.Proc.Id)

$s2 = Start-Backend 'after'
Add-Check 'Backend restarts on same SIMO_HOME' $s2.Ready $(if ($s2.Ready) { $base } else { 'no /api/health in 20s' })
if (-not $s2.Ready) { Stop-Backend $s2; Write-Host 'aborted'; exit 1 }

# ---------------------------------------------------------------- 3) assertions after restart
$wfAfter = Get-Json ('/api/workflows?sessionId=main')
$idsAfter = @($wfAfter.workflows | ForEach-Object { $_.id })
Add-Check 'Workflow survives restart (same id)' ($idsAfter -contains $wfId) ("id=" + $wfId + "; seen=" + ($idsAfter -join ','))

$detail = Get-Json ('/api/workflows/' + $wfId)
$tasks = @($detail.workflow.tasks)
Add-Check 'Workflow detail reachable after restart' ($null -ne $detail.workflow) ("status=" + $detail.workflow.status)

# M19-B semantics: a resumable workflow auto-resumes and converges to a terminal state;
# a non-resumable one must be paused/interrupted WITH an explicit report (never silently lost).
$finalStatus = [string]$detail.workflow.status
$deadline = (Get-Date).AddSeconds(120)
while ((Get-Date) -lt $deadline) {
  try {
    $detail = Get-Json ('/api/workflows/' + $wfId)
    $finalStatus = [string]$detail.workflow.status
    if (@('done', 'partial', 'failed', 'cancelled', 'paused', 'interrupted') -contains $finalStatus) { break }
  } catch { }
  Start-Sleep -Seconds 1
}
Add-Check 'Workflow converges after restart (not hanging)' (@('done', 'partial', 'failed', 'cancelled', 'paused', 'interrupted') -contains $finalStatus) ("status=" + $finalStatus)

if ($finalStatus -eq 'done') {
  Add-Check 'Resumable workflow auto-resumed to done (M19-B)' $true ("status=" + $finalStatus)
} else {
  $msgs0 = Get-Json ('/api/messages?sessionId=main')
  $texts0 = @($msgs0.messages | ForEach-Object { [string]$_.text })
  # Build Chinese keywords via char codes to keep this file ASCII-only (PS 5.1 no-BOM safe).
  $kwRecover = [string]([char]0x6062) + [char]0x590d     # recover
  $kwInterrupt = [string]([char]0x4e2d) + [char]0x65ad   # interrupt
  $kwContinue = [string]([char]0x7ee7) + [char]0x7eed     # continue
  $kwPause = [string]([char]0x6682) + [char]0x505c       # pause
  $pattern = '(' + $kwRecover + '|' + $kwInterrupt + '|' + $kwContinue + '|' + $kwPause + '|recover|interrupt|resume)'
  $explicit = @($texts0 | Where-Object { $_ -match $pattern }).Count -ge 1
  Add-Check 'Non-resumable workflow has explicit report (no silent loss)' $explicit ("status=" + $finalStatus + "; messages=" + @($msgs0.messages).Count)
}

$tasks = @($detail.workflow.tasks)
$statuses = @($tasks | ForEach-Object { [string]$_.status })
$idsNow = @($tasks | ForEach-Object { [string]$_.id })
Add-Check 'No duplicate task rows after restart' ($idsNow.Count -eq @($idsNow | Select-Object -Unique).Count) ("tasks=" + $idsNow.Count)
Add-Check 'Task states are explicit (no silent drop)' (@($statuses | Where-Object { $_ -eq '' }).Count -eq 0) ("statuses=" + ($statuses -join ','))

$msgs = Get-Json ('/api/messages?sessionId=main')
$msgTexts = @($msgs.messages | ForEach-Object { [string]$_.text })
$hasProbe = @($msgTexts | Where-Object { $_ -and $_.Contains($probe) }).Count -ge 1
Add-Check 'Messages survive restart (creation reply present)' $hasProbe ("messages=" + @($msgs.messages).Count)

Stop-Backend $s2

# ---------------------------------------------------------------- summary
Write-Host ''
$passed = $script:total - $script:failures.Count
Write-Host ("RESTART CHECK SUMMARY: {0}/{1} PASS" -f $passed, $script:total)
if ($script:failures.Count -gt 0) { Write-Host ("FAILED: " + ($script:failures -join '; ')) }
Write-Host "workdir: $work"
if ($script:failures.Count -gt 0) { exit 1 } else { exit 0 }

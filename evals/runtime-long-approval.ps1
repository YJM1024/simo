# runtime-long-approval.ps1 -- M19 long-running approval check
#
# Phase 1 (cross-restart persistence):
#   trigger a write approval -> kill the process -> restart on the same AGENTD_HOME ->
#   the same approval must still be pending -> allow -> it executes (approved, result present)
#
# Phase 2 (timeout is fail-closed):
#   when the M19 debug config hook exists (POST /api/debug/runtime/config {approvalTtlMs}),
#   shorten the TTL -> trigger another approval -> wait past the TTL ->
#   approval must be expired / decided by timeout, and must NOT be auto-approved
#   (otherwise SKIP this phase and report that the hook is pending)
#
# Owns its own port + temp AGENTD_HOME and only stops the PIDs it started (never touches 8787).
#
# Usage:
#   powershell -NoProfile -ExecutionPolicy Bypass -File evals/runtime-long-approval.ps1
#   powershell -NoProfile -ExecutionPolicy Bypass -File evals/runtime-long-approval.ps1 -Exe <path> -Port 18909
#
# NOTE: keep this file ASCII-only (Windows PowerShell 5.1 misreads UTF-8 without BOM).

param(
  [string]$Exe = '',
  [int]$Port = 18909
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

$work = Join-Path ([System.IO.Path]::GetTempPath()) ("agentd-longappr-" + [guid]::NewGuid().ToString('N').Substring(0, 8))
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
function Wait-PendingApproval([string]$tool, [int]$timeoutSec) {
  $deadline = (Get-Date).AddSeconds($timeoutSec)
  while ((Get-Date) -lt $deadline) {
    try {
      $a = Get-Json '/api/approvals'
      $hit = @($a.approvals | Where-Object { [string]$_.tool -eq $tool -and [string]$_.status -eq 'pending' })
      if ($hit.Count -ge 1) { return $hit[0] }
    } catch { }
    Start-Sleep -Milliseconds 300
  }
  return $null
}

# ---------------------------------------------------------------- Phase 1: cross-restart
$s1 = Start-Backend 'before'
Add-Check 'Backend starts (fresh home)' $s1.Ready $(if ($s1.Ready) { $base } else { 'no /api/health in 25s' })
if (-not $s1.Ready) { Stop-Backend $s1; exit 1 }

$tag = [guid]::NewGuid().ToString('N').Substring(0, 8)
$sess = Post-Json '/api/sessions' @{ title = "longappr-$tag" }
$sid = [string]$sess.session.id
$null = Post-Json '/api/chat' @{ sessionId = $sid; text = "evals-longappr-$tag mock:write 写一个审批文件。" }
$pending1 = Wait-PendingApproval 'write' 20
Add-Check 'Write approval becomes pending' ($null -ne $pending1) ("id=" + $(if ($pending1) { $pending1.id } else { '<none>' }))
if (-not $pending1) { Stop-Backend $s1; exit 1 }
$apprId = [string]$pending1.id
$expiresAt = [string]$pending1.expiresAt
Write-Host ("pending approval: id=" + $apprId + " expiresAt=" + $expiresAt)

Stop-Backend $s1
Add-Check 'Process killed while approval pending' ($null -eq (Get-Process -Id $s1.Proc.Id -ErrorAction SilentlyContinue)) ("pid=" + $s1.Proc.Id)

$s2 = Start-Backend 'after'
Add-Check 'Backend restarts on same AGENTD_HOME' $s2.Ready $(if ($s2.Ready) { $base } else { 'no /api/health in 25s' })
if (-not $s2.Ready) { Stop-Backend $s2; exit 1 }

$a2 = Get-Json '/api/approvals'
$kept = @($a2.approvals | Where-Object { [string]$_.id -eq $apprId })
Add-Check 'Approval survives restart' ($kept.Count -eq 1) ("found=" + $kept.Count)
$keptStatus = if ($kept.Count -eq 1) { [string]$kept[0].status } else { '<none>' }
Add-Check 'Approval still pending after restart' ($keptStatus -eq 'pending') ("status=" + $keptStatus)

$allow = Post-Json ('/api/approvals/' + $apprId) @{ decision = 'allow' }
Add-Check 'Approve after restart succeeds' ([string]$allow.status -eq 'approved') ("status=" + [string]$allow.status)

Start-Sleep -Seconds 2
$a3 = Get-Json '/api/approvals'
$decided = @($a3.approvals | Where-Object { [string]$_.id -eq $apprId })[0]
$decidedStatus = if ($decided) { [string]$decided.status } else { '<none>' }
Add-Check 'Approved approval executed (status approved, result present)' `
  ($decidedStatus -eq 'approved' -and -not [string]::IsNullOrWhiteSpace([string]$decided.result)) `
  ("status=" + $decidedStatus + "; resultLen=" + ([string]$decided.result).Length)

# ---------------------------------------------------------------- Phase 2: timeout fail-closed
$hookOk = $false
try {
  $cfg = Post-Json '/api/debug/runtime/config' @{ approvalTtlMs = 1500 }
  $hookOk = [bool]$cfg.ok
} catch { $hookOk = $false }

if (-not $hookOk) {
  Add-Skip 'Approval timeout fail-closed' 'debug runtime config hook not available (M19 hook pending)'
} else {
  $tag2 = [guid]::NewGuid().ToString('N').Substring(0, 8)
  $null = Post-Json '/api/chat' @{ sessionId = $sid; text = "evals-longappr2-$tag2 mock:write 超时审批。" }
  $pending2 = Wait-PendingApproval 'write' 15
  Add-Check 'Second approval becomes pending' ($null -ne $pending2) ("id=" + $(if ($pending2) { $pending2.id } else { '<none>' }))
  if ($pending2) {
    $apprId2 = [string]$pending2.id
    Start-Sleep -Seconds 5
    $a4 = Get-Json '/api/approvals'
    $exp = @($a4.approvals | Where-Object { [string]$_.id -eq $apprId2 })[0]
    $st2 = if ($exp) { [string]$exp.status } else { '<none>' }
    $by2 = if ($exp) { [string]$exp.decidedBy } else { '' }
    Add-Check 'Expired approval is not auto-approved' ($st2 -eq 'expired') ("status=" + $st2 + "; decidedBy=" + $by2)
    Add-Check 'Timeout decided by system/timeout' ($by2 -eq 'timeout' -or $by2 -eq 'system') ("decidedBy=" + $by2)
    Add-Check 'Expired approval did not execute' ([string]::IsNullOrWhiteSpace([string]$exp.result)) ("resultLen=" + ([string]$exp.result).Length)
  }
}

Stop-Backend $s2

# ---------------------------------------------------------------- summary
Write-Host ''
$passed = $script:total - $script:failures.Count
Write-Host ("LONG-APPROVAL SUMMARY: {0}/{1} PASS" -f $passed, $script:total)
if ($script:skips.Count -gt 0) { Write-Host ("SKIPPED: " + ($script:skips -join '; ')) }
if ($script:failures.Count -gt 0) { Write-Host ("FAILED: " + ($script:failures -join '; ')) }
Write-Host "workdir: $work"
if ($script:failures.Count -gt 0) { exit 1 } else { exit 0 }

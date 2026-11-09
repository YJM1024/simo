# reply-persist.ps1 -- M15 reply-quote persistence check across a real process restart
#
# Asserts that a message's `replyTo` snapshot (id/role/text/sessionId/sessionTitle) survives
# a backend restart: the snapshot is resolved from the referenced message at read time, so a
# restart must not lose the link (migration v11 `reply_to_id`).
#
# Owns its own port + temp AGENTD_HOME and only stops the PIDs it started (never touches 8787).
#
# Usage:
#   powershell -NoProfile -ExecutionPolicy Bypass -File evals/reply-persist.ps1
#   powershell -NoProfile -ExecutionPolicy Bypass -File evals/reply-persist.ps1 -Exe <path> -Port 18906
#
# NOTE: keep this file ASCII-only (Windows PowerShell 5.1 misreads UTF-8 without BOM).

param(
  [string]$Exe = '',
  [int]$Port = 18906
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
if (-not $Exe) { $Exe = Join-Path $repo 'toolchain\tmp\release\agentd.exe' }
if (-not (Test-Path $Exe)) { Write-Host "FAIL: agentd exe not found: $Exe"; exit 2 }

$work = Join-Path ([System.IO.Path]::GetTempPath()) ("agentd-replypersist-" + [guid]::NewGuid().ToString('N').Substring(0, 8))
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
  $deadline = (Get-Date).AddSeconds(20)
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
  $content = (Invoke-WebRequest ($base + $path) -Method Post -Body ($body | ConvertTo-Json -Depth 5) `
      -ContentType 'application/json' -UseBasicParsing).Content
  return $content | ConvertFrom-Json
}

function Get-MessageById([string]$sid, [string]$mid) {
  $msgs = Get-Json ('/api/messages?sessionId=' + $sid)
  foreach ($m in @($msgs.messages)) { if ([string]$m.id -eq $mid) { return $m } }
  return $null
}

# ---------------------------------------------------------------- 1) start + create reply chain
$s1 = Start-Backend 'before'
Add-Check 'Backend starts (fresh home)' $s1.Ready $(if ($s1.Ready) { $base } else { 'no /api/health in 20s' })
if (-not $s1.Ready) { Stop-Backend $s1; exit 1 }

$tag = [guid]::NewGuid().ToString('N').Substring(0, 8)
$sess = Post-Json '/api/sessions' @{ title = "replypersist-$tag" }
$sid = [string]$sess.session.id
Add-Check 'Session created' (-not [string]::IsNullOrWhiteSpace($sid)) ("sid=" + $sid)

# 第一条用不带任务词的句子，保证 mock 立刻给出非空回复
$null = Post-Json '/api/chat' @{ sessionId = $sid; text = "evals-replypersist-$tag 今天有点热。" }
Start-Sleep -Seconds 2
$msgs1 = Get-Json ('/api/messages?sessionId=' + $sid)
$agents = @($msgs1.messages | Where-Object { [string]$_.role -eq 'agent' })
$agent = if ($agents.Count -gt 0) { $agents[$agents.Count - 1] } else { $null }
Add-Check 'First turn produced an agent reply' ($null -ne $agent) ("agentId=" + $(if ($agent) { $agent.id } else { '<none>' }))
if (-not $agent) { Stop-Backend $s1; exit 1 }
$agentId = [string]$agent.id
$agentTextLen = ([string]$agent.text).Length
Add-Check 'Referenced agent reply has non-empty text' ($agentTextLen -gt 0) ("len=" + $agentTextLen)

# 带引用回复（按返回的 messageId 精确定位，不做文本过滤）
$respB = Post-Json '/api/chat' @{ sessionId = $sid; text = "evals-replypersist-$tag 上面这条再展开说说。"; replyToMessageId = $agentId }
$bMsgId = [string]$respB.messageId
if ([string]::IsNullOrWhiteSpace($bMsgId)) { $bMsgId = [string]$respB.id }
Add-Check 'Reply POST returns a message id' (-not [string]::IsNullOrWhiteSpace($bMsgId)) ("messageId=" + $bMsgId)
Start-Sleep -Seconds 2

$replyUser = Get-MessageById $sid $bMsgId
$snap = if ($replyUser) { $replyUser.replyTo } else { $null }
Add-Check 'Reply message carries replyTo before restart' ($null -ne $snap) `
  ("replyToId=" + $(if ($snap) { $snap.id } else { '<none>' }))
$beforeId = if ($snap) { [string]$snap.id } else { '' }
Add-Check 'replyTo points at the referenced agent message' ($beforeId -eq $agentId) `
  ("expected=" + $agentId + "; got=" + $beforeId)

Stop-Backend $s1

# ---------------------------------------------------------------- 2) restart on same home
$s2 = Start-Backend 'after'
Add-Check 'Backend restarts on same AGENTD_HOME' $s2.Ready $(if ($s2.Ready) { $base } else { 'no /api/health in 20s' })
if (-not $s2.Ready) { Stop-Backend $s2; exit 1 }

# ---------------------------------------------------------------- 3) assertions after restart
$replyUser3 = Get-MessageById $sid $bMsgId
Add-Check 'Reply message still present after restart' ($null -ne $replyUser3) ("id=" + $bMsgId)

$snap3 = if ($replyUser3) { $replyUser3.replyTo } else { $null }
Add-Check 'replyTo snapshot survives restart' ($null -ne $snap3) $(if ($snap3) { 'replyTo present' } else { 'no snapshot' })
if ($snap3) {
  Add-Check 'replyTo.id unchanged' ([string]$snap3.id -eq $beforeId) ("id=" + $snap3.id)
  Add-Check 'replyTo.role correct' ([string]$snap3.role -eq 'agent') ("role=" + $snap3.role)
  Add-Check 'replyTo.text non-empty' (-not [string]::IsNullOrWhiteSpace([string]$snap3.text)) ("len=" + ([string]$snap3.text).Length)
  Add-Check 'replyTo.sessionId correct' ([string]$snap3.sessionId -eq $sid) ("sessionId=" + $snap3.sessionId)
  Add-Check 'replyTo.sessionTitle non-empty' (-not [string]::IsNullOrWhiteSpace([string]$snap3.sessionTitle)) ("title=" + $snap3.sessionTitle)
} else {
  Add-Check 'replyTo.id unchanged' $false 'no snapshot'
  Add-Check 'replyTo.role correct' $false 'no snapshot'
  Add-Check 'replyTo.text non-empty' $false 'no snapshot'
  Add-Check 'replyTo.sessionId correct' $false 'no snapshot'
  Add-Check 'replyTo.sessionTitle non-empty' $false 'no snapshot'
}

Stop-Backend $s2

# ---------------------------------------------------------------- summary
Write-Host ''
$passed = $script:total - $script:failures.Count
Write-Host ("REPLY PERSIST SUMMARY: {0}/{1} PASS" -f $passed, $script:total)
if ($script:failures.Count -gt 0) { Write-Host ("FAILED: " + ($script:failures -join '; ')) }
Write-Host "workdir: $work"
if ($script:failures.Count -gt 0) { exit 1 } else { exit 0 }

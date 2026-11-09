# team-v1-persist.ps1 -- M24 team V1 persistence across restart
#
# Why a separate script: verifying "members + internal messages survive restart" needs two
# processes on the SAME AGENTD_HOME, which a single run.mjs invocation cannot do.
#   1) start server -> team.template.upsert + team.create (2 members, generic + template)
#   2) send one internal team message (team.message.send, not visible in user main window)
#   3) kill the process -> restart on the same home
#   4) assert: same team id/members, internal messages still present, member sessions still listed
# Owns its own port + temp AGENTD_HOME and only stops the PIDs it started (never touches 8787).
#
# Usage: powershell -NoProfile -ExecutionPolicy Bypass -File evals/team-v1-persist.ps1 [-Exe path] [-Port 18916]
# NOTE: keep this file ASCII-only (Windows PowerShell 5.1 misreads UTF-8 without BOM).

param(
  [string]$Exe = '',
  [int]$Port = 18916
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

$work = Join-Path ([System.IO.Path]::GetTempPath()) ("agentd-teampersist-" + [guid]::NewGuid().ToString('N').Substring(0, 8))
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
  Start-Sleep -Milliseconds 800
}
function Get-Json([string]$path) {
  return (Invoke-WebRequest ($base + $path) -TimeoutSec 20 -UseBasicParsing).Content | ConvertFrom-Json
}
function Post-Json([string]$path, [hashtable]$body) {
  return ((Invoke-WebRequest ($base + $path) -Method Post -Body ($body | ConvertTo-Json -Depth 6) `
      -ContentType 'application/json' -UseBasicParsing).Content | ConvertFrom-Json)
}

# ---------------------------------------------------------------- phase 1: create team + message
$s1 = Start-Backend 'first'
Add-Check 'Backend starts (first run)' $s1.Ready $(if ($s1.Ready) { $base } else { 'no /api/health' })
if (-not $s1.Ready) { Stop-Backend $s1; exit 1 }

$tag = [guid]::NewGuid().ToString('N').Substring(0, 8)
$tpl = Post-Json '/api/actions/team.template.upsert' @{
  name = "v1persist-$tag"
  roles = @(
    @{ roleKey = 'researcher'; title = 'Researcher'; roleType = 'generic'; agentId = 'researcher' },
    @{ roleKey = 'reviewer'; title = 'Reviewer'; roleType = 'template' }
  )
}
Add-Check 'Template created' ($tpl.ok -eq $true -and $tpl.data.id -ne '') ("templateId=" + $tpl.data.id)

$created = Post-Json '/api/actions/team.create' @{ sessionId = 'main'; templateId = [string]$tpl.data.id }
$teamId = [string]$created.data.team.id
$members = @($created.data.members)
Add-Check 'Team created with 2 members' ($teamId -ne '' -and $members.Count -eq 2) ("teamId=$teamId; members=" + $members.Count)
if ($teamId -eq '' -or $members.Count -lt 2) { Stop-Backend $s1; exit 1 }

$fromSession = [string]$members[0].sessionId
$toSession = [string]$members[1].sessionId
$content = "v1-internal-$tag"
$sent = Post-Json '/api/actions/team.message.send' @{
  teamId = $teamId; fromSessionId = $fromSession; toSessionId = $toSession; content = $content
}
Add-Check 'Internal team message sent' ($sent.ok -eq $true) ("messageId=" + $sent.data.id)

$msgsBefore = Get-Json ('/api/teams/' + $teamId + '/messages')
$countBefore = @($msgsBefore.messages).Count
Add-Check 'Internal message visible before restart' ($countBefore -ge 1) ("messages=" + $countBefore)
Stop-Backend $s1

# ---------------------------------------------------------------- phase 2: restart same home
$s2 = Start-Backend 'second'
Add-Check 'Backend restarts on same AGENTD_HOME' $s2.Ready $(if ($s2.Ready) { $base } else { 'no /api/health' })
if (-not $s2.Ready) { Stop-Backend $s2; exit 1 }

$teamAfter = Get-Json ('/api/teams/' + $teamId)
Add-Check 'Team survives restart (same id)' ($teamAfter.ok -eq $true -and [string]$teamAfter.team.id -eq $teamId) ("teamId=" + $teamAfter.team.id)
$membersAfter = @($teamAfter.members)
Add-Check 'Members survive restart (2)' ($membersAfter.Count -eq 2) ("members=" + $membersAfter.Count)
$sessionsAfter = @($membersAfter | ForEach-Object { [string]$_.sessionId })
Add-Check 'Member sessions still addressable' (($sessionsAfter -contains $fromSession) -and ($sessionsAfter -contains $toSession)) ("sessions=" + ($sessionsAfter -join ','))

$msgsAfter = Get-Json ('/api/teams/' + $teamId + '/messages')
$countAfter = @($msgsAfter.messages).Count
Add-Check 'Internal message survives restart (no loss)' ($countAfter -ge $countBefore) ("before=$countBefore; after=$countAfter")
$hasContent = @($msgsAfter.messages | Where-Object { [string]$_.payload.content -eq $content }).Count -ge 1
Add-Check 'Internal message content intact' $hasContent $content

$sessions = Get-Json '/api/sessions'
$allSessions = @($sessions.sessions | ForEach-Object { [string]$_.id })
Add-Check 'Member sessions listed after restart' (($allSessions -contains $fromSession) -and ($allSessions -contains $toSession)) ("sessions=" + $allSessions.Count)

Stop-Backend $s2

# ---------------------------------------------------------------- summary
Write-Host ''
$passed = $script:total - $script:failures.Count
Write-Host ("TEAM V1 PERSIST SUMMARY: {0}/{1} PASS" -f $passed, $script:total)
if ($script:failures.Count -gt 0) { Write-Host ("FAILED: " + ($script:failures -join '; ')) }
Write-Host "workdir: $work"
if ($script:failures.Count -gt 0) { exit 1 } else { exit 0 }

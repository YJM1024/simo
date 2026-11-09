# category-backfill.ps1 -- M14 migration backfill check (old schema -> upgrade -> backfill)
#
# Why a separate script: verifying backfill needs TWO binaries on the SAME AGENTD_HOME:
#   1) start an OLD build (pre-M14) -> create a session with a couple of agent replies
#      (messages exist, but the `category` column does not exist yet)
#   2) stop it, start the CURRENT build on the same home -> chat migration v10 runs
#   3) GET /api/messages -> historical AGENT messages must be backfilled to `consultation`,
#      historical USER messages keep empty category, and sessionPath is available
#
# Owns its own port + temp AGENTD_HOME and only stops the PIDs it started (never touches 8787).
#
# Usage:
#   powershell -NoProfile -ExecutionPolicy Bypass -File evals/category-backfill.ps1
#   powershell -NoProfile -ExecutionPolicy Bypass -File evals/category-backfill.ps1 `
#       -OldExe toolchain\tmp\agentd-m13.exe -NewExe toolchain\tmp\release\agentd.exe -Port 18905
#
# NOTE: keep this file ASCII-only (Windows PowerShell 5.1 misreads UTF-8 without BOM).

param(
  [string]$OldExe = '',
  [string]$NewExe = '',
  [int]$Port = 18905
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
if (-not $OldExe) { $OldExe = Join-Path $repo 'toolchain\tmp\agentd-m13.exe' }
if (-not $NewExe) { $NewExe = Join-Path $repo 'agentd\simo.exe' }
if (-not (Test-Path $OldExe)) { Write-Host "FAIL: old (pre-M14) exe not found: $OldExe"; exit 2 }
if (-not (Test-Path $NewExe)) { Write-Host "FAIL: current exe not found: $NewExe"; exit 2 }

$work = Join-Path ([System.IO.Path]::GetTempPath()) ("agentd-backfill-" + [guid]::NewGuid().ToString('N').Substring(0, 8))
$homeDir = Join-Path $work 'home'
New-Item -ItemType Directory -Force -Path $homeDir | Out-Null
$base = "http://127.0.0.1:$Port"

Write-Host "workdir: $work"
Write-Host "old exe: $OldExe"
Write-Host "new exe: $NewExe"
Write-Host "port: $Port"
Write-Host ''

$env:AGENTD_HOME = $homeDir
$env:AGENTD_LLM = 'mock'
$env:AGENTD_DEBUG = '1'

function Start-Backend([string]$exe, [string]$label) {
  $l = Join-Path $work ($label + '.log')
  $p = Start-Process -FilePath $exe -ArgumentList 'serve', '-addr', ("127.0.0.1:" + $Port) `
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

function Post-Chat([string]$text) {
  $body = @{ sessionId = 'main'; text = $text } | ConvertTo-Json
  $null = Invoke-WebRequest ($base + '/api/chat') -Method Post -Body $body -ContentType 'application/json' -UseBasicParsing
}

# ---------------------------------------------------------------- 1) OLD build: create pre-M14 messages
$old = Start-Backend $OldExe 'old'
Add-Check 'Pre-M14 build starts (old schema)' $old.Ready $(if ($old.Ready) { $base } else { 'no /api/health in 20s' })
if (-not $old.Ready) { Stop-Backend $old; exit 1 }

$tag = [guid]::NewGuid().ToString('N').Substring(0, 8)
Post-Chat "evals-backfill-$tag 第一条：今天几号？"
Start-Sleep -Seconds 2
Post-Chat "evals-backfill-$tag 第二条：帮我把这句话复述一遍。"
Start-Sleep -Seconds 3

$oldMsgs = Get-Json ('/api/messages?sessionId=main')
$oldAgents = @($oldMsgs.messages | Where-Object { [string]$_.role -eq 'agent' })
Add-Check 'Old build has agent messages before upgrade' ($oldAgents.Count -ge 1) ("agent messages=" + $oldAgents.Count)
Stop-Backend $old

# sanity: db file exists for the upgrade
$dbPath = Join-Path $homeDir 'agentd.db'
Add-Check 'AGENTD_HOME db file exists before upgrade' (Test-Path $dbPath) $dbPath
if (-not (Test-Path $dbPath)) { Write-Host 'aborted'; exit 1 }

# ---------------------------------------------------------------- 2) CURRENT build: upgrade migration
$new = Start-Backend $NewExe 'new'
Add-Check 'Current (M14) build starts on old home (migration v10)' $new.Ready $(if ($new.Ready) { $base } else { 'no /api/health in 20s' })
if (-not $new.Ready) { Stop-Backend $new; exit 1 }

# ---------------------------------------------------------------- 3) assertions after upgrade
$msgs = Get-Json ('/api/messages?sessionId=main')
$all = @($msgs.messages)
Add-Check 'Messages readable after upgrade' ($all.Count -ge 2) ("messages=" + $all.Count)

$agents = @($all | Where-Object { [string]$_.role -eq 'agent' })
$consultation = @($agents | Where-Object { [string]$_.category -eq 'consultation' })
Add-Check 'Historical agent messages backfilled to consultation' ($agents.Count -ge 1 -and $consultation.Count -eq $agents.Count) `
  ("agent=" + $agents.Count + "; consultation=" + $consultation.Count)

$users = @($all | Where-Object { [string]$_.role -eq 'user' })
$emptyCats = @($users | Where-Object { [string]::IsNullOrEmpty([string]$_.category) })
Add-Check 'Historical user messages stay uncategorized' ($users.Count -ge 1 -and $emptyCats.Count -eq $users.Count) `
  ("user=" + $users.Count + "; empty=" + $emptyCats.Count)

$hasPath = @($all | Where-Object { $null -ne $_.sessionPath }).Count -ge 1
Add-Check 'Messages expose sessionPath after upgrade' $hasPath 'sessionPath present'

Stop-Backend $new

# ---------------------------------------------------------------- summary
Write-Host ''
$passed = $script:total - $script:failures.Count
Write-Host ("BACKFILL CHECK SUMMARY: {0}/{1} PASS" -f $passed, $script:total)
if ($script:failures.Count -gt 0) { Write-Host ("FAILED: " + ($script:failures -join '; ')) }
Write-Host "workdir: $work"
if ($script:failures.Count -gt 0) { exit 1 } else { exit 0 }

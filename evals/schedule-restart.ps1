# schedule-restart.ps1 -- M13 restart-recovery check for scheduled tasks (real process restart)
#
# Why a separate script: run.mjs assumes an already-running server, but this check must
# kill and restart the process. Owns its own port + temp SIMO_HOME and only stops the
# PID it started, so the user's 8787 instance is never touched.
#
# Asserts:
#   1) interval schedule survives restart, still enabled, nextRunAt recomputed (> 0)
#   2) a once schedule that came due while the process was down is caught up exactly once
#      (runCount >= 1, lastStatus done/failed) -- "只补最近一次"
#   3) the delivered prompt shows up in the target session messages
#
# Usage:
#   powershell -NoProfile -ExecutionPolicy Bypass -File evals/schedule-restart.ps1
#   powershell -NoProfile -ExecutionPolicy Bypass -File evals/schedule-restart.ps1 -Exe <path> -Port 18904
#
# NOTE: keep this file ASCII-only (Windows PowerShell 5.1 misreads UTF-8 without BOM).

param(
  [string]$Exe = '',
  [int]$Port = 18904
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
if (-not $Exe) { $Exe = Join-Path $repo 'toolchain\tmp\release\simo.exe' }
if (-not (Test-Path $Exe)) { Write-Host "FAIL: simo exe not found: $Exe"; exit 2 }

$work = Join-Path ([System.IO.Path]::GetTempPath()) ("simo-schrestart-" + [guid]::NewGuid().ToString('N').Substring(0, 8))
$homeDir = Join-Path $work 'home'
New-Item -ItemType Directory -Force -Path $homeDir | Out-Null
$base = "http://127.0.0.1:$Port"
$log = Join-Path $work 'server.log'

Write-Host "workdir: $work"
Write-Host "exe: $Exe"
Write-Host "port: $Port"
Write-Host ''

$env:SIMO_HOME = $homeDir
$env:SIMO_LLM = 'mock'
$env:SIMO_DEBUG = '1'

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
  Start-Sleep -Milliseconds 500
}

function Get-Json([string]$path) {
  return (Invoke-WebRequest ($base + $path) -TimeoutSec 15 -UseBasicParsing).Content | ConvertFrom-Json
}

function Post-Json([string]$path, [object]$body) {
  return (Invoke-WebRequest ($base + $path) -Method Post -Body ($body | ConvertTo-Json -Depth 6) `
      -ContentType 'application/json' -UseBasicParsing).Content | ConvertFrom-Json
}

function Get-Schedule([string]$id) {
  return (Get-Json ('/api/schedules/' + $id)).schedule
}

# ---------------------------------------------------------------- 1) start + create schedules
$s1 = Start-Backend 'before'
Add-Check 'Backend starts (fresh home)' $s1.Ready $(if ($s1.Ready) { $base } else { 'no /api/health in 20s' })
if (-not $s1.Ready) { Stop-Backend $s1; exit 1 }

$tag = [guid]::NewGuid().ToString('N').Substring(0, 8)
$promptA = "evals-restart-a-$tag"
$promptB = "evals-restart-b-$tag"

$schA = (Post-Json '/api/schedules' @{
  sessionId = 'main'; title = "restart-a-$tag"; prompt = $promptA
  trigger = @{ type = 'interval'; expr = '3600' }
}).schedule
Add-Check 'interval schedule created' ($null -ne $schA.id) ("id=" + $schA.id + "; nextRunAt=" + $schA.nextRunAt)

$dueIso = (Get-Date).ToUniversalTime().AddSeconds(3).ToString('yyyy-MM-ddTHH:mm:ssZ')
$schB = (Post-Json '/api/schedules' @{
  sessionId = 'main'; title = "restart-b-$tag"; prompt = $promptB
  trigger = @{ type = 'once'; expr = $dueIso }
}).schedule
Add-Check 'once schedule created (due in 3s)' ($null -ne $schB.id) ("id=" + $schB.id + "; nextRunAt=" + $schB.nextRunAt)

# ---------------------------------------------------------------- 2) kill before it fires + restart
Stop-Backend $s1
$alive1 = $null -ne (Get-Process -Id $s1.Proc.Id -ErrorAction SilentlyContinue)
Add-Check 'Process stopped before restart' (-not $alive1) ("pid=" + $s1.Proc.Id)

$s2 = Start-Backend 'after'
Add-Check 'Backend restarts on same SIMO_HOME' $s2.Ready $(if ($s2.Ready) { $base } else { 'no /api/health in 20s' })
if (-not $s2.Ready) { Stop-Backend $s2; exit 1 }

# ---------------------------------------------------------------- 3) assertions after restart
$list = Get-Json '/api/schedules'
$ids = @($list.schedules | ForEach-Object { $_.id })
Add-Check 'interval schedule survives restart' ($ids -contains $schA.id) ("seen=" + ($ids -join ','))

$afterA = Get-Schedule $schA.id
Add-Check 'interval still enabled after restart' ([bool]$afterA.enabled) ("enabled=" + $afterA.enabled)
Add-Check 'interval nextRunAt recomputed (> 0)' ([int64]$afterA.nextRunAt -gt 0) ("nextRunAt=" + $afterA.nextRunAt)

Start-Sleep -Seconds 10  # recover + 5s tick -> catch-up fire

$afterB = Get-Schedule $schB.id
$statusB = [string]$afterB.lastStatus
Add-Check 'missed once caught up (runCount >= 1)' ([int]$afterB.runCount -ge 1) ("runCount=" + $afterB.runCount)
Add-Check 'missed once finished (done/failed)' (@('done', 'failed', 'running') -contains $statusB) ("lastStatus=" + $statusB)

Start-Sleep -Seconds 4  # let delivery settle

$msgs = Get-Json ('/api/messages?sessionId=main')
$texts = @($msgs.messages | ForEach-Object { [string]$_.text })
$delivered = @($texts | Where-Object { $_.Contains($promptB) }).Count -ge 1
Add-Check 'delivered prompt visible in target session' $delivered ("messages=" + @($msgs.messages).Count)

Stop-Backend $s2

# ---------------------------------------------------------------- summary
Write-Host ''
$passed = $script:total - $script:failures.Count
Write-Host ("SCHEDULE RESTART SUMMARY: {0}/{1} PASS" -f $passed, $script:total)
if ($script:failures.Count -gt 0) { Write-Host ("FAILED: " + ($script:failures -join '; ')) }
Write-Host "workdir: $work"
if ($script:failures.Count -gt 0) { exit 1 } else { exit 0 }

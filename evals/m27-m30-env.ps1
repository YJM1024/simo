# m27-m30-env.ps1 -- M27/M30 env-driven acceptance (R2 off, consolidation off)
#
# Starts the server with SIMO_RECALL_R2=0 and SIMO_MEMORY_CONSOLIDATE=0,
# then performs the env-gated assertions directly (the two eval cases are marked
# pending in run.mjs because a single run.mjs process cannot change server env):
#   - memory-consolidate-off : no auto consolidation above threshold; manual debug still works
#   - recall-r2-switch       : R1 only -> hopLimit=1, no agentic steps, hop_capped
# Owns its own port + workspace .tmp home; never touches 8787 / simo-live.
#
# Usage: powershell -NoProfile -ExecutionPolicy Bypass -File evals/m27-m30-env.ps1 [-Exe path] [-Port 18932]
# NOTE: keep this file ASCII-only (Windows PowerShell 5.1 misreads UTF-8 without BOM).

param(
  [string]$Exe = '',
  [int]$Port = 18932
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

$tmpRoot = Join-Path $repo '.tmp'
New-Item -ItemType Directory -Force -Path $tmpRoot | Out-Null
$work = Join-Path $tmpRoot ("m27-m30-env-" + [guid]::NewGuid().ToString('N').Substring(0, 8))
$homeDir = Join-Path $work 'home'
New-Item -ItemType Directory -Force -Path $homeDir | Out-Null
$base = "http://127.0.0.1:$Port"

Write-Host "workdir: $work"
Write-Host "exe: $Exe"
Write-Host "port: $Port (SIMO_RECALL_R2=0, SIMO_MEMORY_CONSOLIDATE=0)"
Write-Host ''

$env:SIMO_HOME = $homeDir
$env:SIMO_LLM = 'mock'
$env:SIMO_DEBUG = '1'
$env:SIMO_RECALL_R2 = '0'
$env:SIMO_MEMORY_CONSOLIDATE = '0'
Remove-Item Env:SIMO_RECALL_VECTOR -ErrorAction SilentlyContinue

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
Add-Check 'Backend starts with R2=0 / CONSOLIDATE=0' $ready $(if ($ready) { $base } else { 'no /api/health in 25s' })
if (-not $ready) { Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue; exit 1 }

function Get-Json([string]$path) {
  return (Invoke-WebRequest ($base + $path) -TimeoutSec 20 -UseBasicParsing).Content | ConvertFrom-Json
}
function Post-Json([string]$path, [hashtable]$body) {
  $json = $body | ConvertTo-Json -Depth 8 -Compress
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
  return ((Invoke-WebRequest ($base + $path) -Method Post -Body $bytes -ContentType 'application/json; charset=utf-8' -UseBasicParsing).Content | ConvertFrom-Json)
}

$tag = [guid]::NewGuid().ToString('N').Substring(0, 8)
$sid = "envoff-$tag"

# ---- memory-consolidate-off: above threshold still no auto job; manual debug works.
for ($i = 1; $i -le 9; $i++) {
  $null = Post-Json '/api/chat' @{ sessionId = $sid; text = "agreement $i : project code EnvOff$i-$tag, data tidying." }
}
Start-Sleep -Milliseconds 1200
$before = Get-Json ("/api/debug/memory/consolidation?sessionId=" + $sid)
Add-Check 'Consolidate disabled reported' ($before.enabled -eq $false) ("enabled=" + $before.enabled)
Add-Check 'No auto job above threshold' ([int]$before.total -eq 0) ("total=" + $before.total)

$manual = Post-Json '/api/debug/memory/consolidate' @{ sessionId = $sid; agentId = 'agent:simo'; maxMessages = 20 }
Add-Check 'Manual debug still works when disabled' ($manual.ok -eq $true -and -not [string]::IsNullOrWhiteSpace([string]$manual.job.id)) ("job=" + $manual.job.id)
$after = Get-Json ("/api/debug/memory/consolidation?sessionId=" + $sid)
Add-Check 'Manual job recorded exactly once' ([int]$after.total -eq 1) ("total=" + $after.total)

# ---- recall-r2-switch: R2=0 -> hopLimit=1, no agentic steps, hop_capped warning.
$recall = Post-Json '/api/debug/recall' @{ query = "no-such-switch-$tag"; sessionId = 'main'; agentId = 'agent:simo'; trace = 'full'; budget = @{ maxHop = 2 } }
$hop = [int]$recall.trace.queryPlan.hopLimit
$stepCount = 0
if ($recall.trace.steps) { $stepCount = @($recall.trace.steps).Count }
$warn = @($recall.warnings)
Add-Check 'R2=0 clamps hopLimit to 1' ($hop -eq 1) ("hopLimit=" + $hop)
Add-Check 'R2=0 has no agentic steps' ($stepCount -eq 0) ("steps=" + $stepCount)
Add-Check 'R2=0 reports hop_capped' ($warn -contains 'hop_capped') ("warnings=" + ($warn -join ','))

# ---- M32 vector default off: no vector trace path; FTS still returns items.
$vecTag = "VecDefault-$tag"
$vecEntity = "ent-vec-$tag"
$vecMem = "mem-vec-$tag"
$vecSeeded = Post-Json '/api/debug/recall/seed' @{
  entities = @(@{ id = $vecEntity; kind = 'item'; entity_class = 'semantic'; canonical_name = $vecTag })
  memoryItems = @(@{ id = $vecMem; content = "$vecTag is a default-off FTS memory"; type = 'semantic'; version = 1; layer = 1; status = 'active' })
}
$vecRecall = Post-Json '/api/debug/recall' @{ query = $vecTag; sessionId = 'main'; agentId = 'agent:simo'; trace = 'full' }
$vecItems = @($vecRecall.items)
$vecPathNames = @($vecRecall.trace.paths | ForEach-Object { [string]$_.name })
$vecWarnings = @($vecRecall.warnings)
Add-Check 'M32 vector default off: seed ok' ($vecSeeded.ok -eq $true) ("documents=" + $vecSeeded.vectors.documents)
Add-Check 'M32 vector default off: FTS still returns items' ($vecItems.Count -ge 1) ("items=" + $vecItems.Count)
Add-Check 'M32 vector default off: no vector trace path' (-not ($vecPathNames -contains 'vector')) ("paths=" + ($vecPathNames -join ','))
Add-Check 'M32 vector default off: no vector_used warning' (-not ($vecWarnings -contains 'vector_used')) ("warnings=" + ($vecWarnings -join ','))

Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
Write-Host ''
$passed = $script:total - $script:failures.Count
Write-Host ("M27/M30 ENV SUMMARY: {0}/{1} PASS" -f $passed, $script:total)
if ($script:failures.Count -gt 0) { Write-Host ("FAILED: " + ($script:failures -join '; ')) }
Write-Host "workdir: $work"
if ($script:failures.Count -gt 0) { exit 1 } else { exit 0 }

# m32-vector-env.ps1 -- M32 local vector recall acceptance (AGENTD_RECALL_VECTOR=1)
#
# Starts the server with AGENTD_RECALL_VECTOR=1, then asserts the env-gated case
# directly (the eval case `recall-vector` is marked pending because a single
# run.mjs process cannot change server env):
#   - seed/rebuild -> vectors.documents >= 1
#   - recall -> items non-empty, trace.paths contains "vector", warnings contain
#     vector_used, hopLimit=2 (R2 default on)
# Default-off behaviour (no vector path, FTS still works) is covered by
# evals/m27-m30-env.ps1.
# Owns its own port + workspace .tmp home; never touches 8787 / simo-live.
#
# Usage: powershell -NoProfile -ExecutionPolicy Bypass -File evals/m32-vector-env.ps1 [-Exe path] [-Port 19061]
# NOTE: keep this file ASCII-only (Windows PowerShell 5.1 misreads UTF-8 without BOM).

param(
  [string]$Exe = '',
  [int]$Port = 19061
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

$tmpRoot = Join-Path $repo '.tmp'
New-Item -ItemType Directory -Force -Path $tmpRoot | Out-Null
$work = Join-Path $tmpRoot ("m32-vector-" + [guid]::NewGuid().ToString('N').Substring(0, 8))
$homeDir = Join-Path $work 'home'
New-Item -ItemType Directory -Force -Path $homeDir | Out-Null
$base = "http://127.0.0.1:$Port"

Write-Host "workdir: $work"
Write-Host "exe: $Exe"
Write-Host "port: $Port (AGENTD_RECALL_VECTOR=1)"
Write-Host ''

$env:AGENTD_HOME = $homeDir
$env:AGENTD_LLM = 'mock'
$env:AGENTD_DEBUG = '1'
$env:AGENTD_RECALL_VECTOR = '1'
Remove-Item Env:AGENTD_MEMORY_CONSOLIDATE -ErrorAction SilentlyContinue
Remove-Item Env:AGENTD_RECALL_R2 -ErrorAction SilentlyContinue

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
Add-Check 'Backend starts with AGENTD_RECALL_VECTOR=1' $ready $(if ($ready) { $base } else { 'no /api/health in 25s' })
if (-not $ready) { Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue; exit 1 }

function Post-Json([string]$path, [hashtable]$body) {
  $json = $body | ConvertTo-Json -Depth 10 -Compress
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
  return ((Invoke-WebRequest ($base + $path) -Method Post -Body $bytes -ContentType 'application/json; charset=utf-8' -UseBasicParsing).Content | ConvertFrom-Json)
}

$tag = [guid]::NewGuid().ToString('N').Substring(0, 8)
$probe = "VectorProbe-$tag"
$entity = "ent-vector-$tag"
$mem = "mem-vector-$tag"

$seeded = Post-Json '/api/debug/recall/seed' @{
  entities = @(@{ id = $entity; kind = 'item'; entity_class = 'semantic'; canonical_name = $probe })
  memoryItems = @(@{ id = $mem; content = "$probe is a vector recall probe memory"; type = 'semantic'; version = 1; layer = 1; status = 'active' })
}
Add-Check 'Seed rebuilds local vector index' ($seeded.ok -eq $true -and [int]$seeded.vectors.documents -ge 1) ("documents=" + $seeded.vectors.documents + " terms=" + $seeded.vectors.terms)

$rebuilt = Post-Json '/api/debug/recall/rebuild' @{}
Add-Check 'Explicit rebuild keeps vector index' ($rebuilt.ok -eq $true -and [int]$rebuilt.vectors.documents -ge 1) ("documents=" + $rebuilt.vectors.documents)

$recall = Post-Json '/api/debug/recall' @{ query = $probe; sessionId = 'main'; agentId = 'agent:simo'; trace = 'full' }
$items = @($recall.items)
$pathNames = @($recall.trace.paths | ForEach-Object { [string]$_.name })
$warnings = @($recall.warnings)
Add-Check 'Vector recall returns items' ($items.Count -ge 1) ("items=" + $items.Count)
Add-Check 'Vector recall trace.paths contains vector' ($pathNames -contains 'vector') ("paths=" + ($pathNames -join ','))
Add-Check 'Vector recall reports vector_used' ($warnings -contains 'vector_used') ("warnings=" + ($warnings -join ','))
Add-Check 'R2 hopLimit=2 by default' ([int]$recall.trace.queryPlan.hopLimit -eq 2) ("hopLimit=" + $recall.trace.queryPlan.hopLimit)
Add-Check 'Vector recall hits seeded memory' (@($items | Where-Object { [string]$_.itemId -eq $mem }).Count -ge 1) ("mem=" + $mem)

Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
Write-Host ''
$passed = $script:total - $script:failures.Count
Write-Host ("M32 VECTOR SUMMARY: {0}/{1} PASS" -f $passed, $script:total)
if ($script:failures.Count -gt 0) { Write-Host ("FAILED: " + ($script:failures -join '; ')) }
Write-Host "workdir: $work"
if ($script:failures.Count -gt 0) { exit 1 } else { exit 0 }

# real-smoke.ps1 -- real-model smoke suite (low token), isolated port + home
#
# Why a separate entry:
#   - The 44-case mock suite stays the DEFAULT gate (deterministic, zero cost). It verifies
#     protocols/orchestration/permissions, not model behaviour.
#   - This script runs the 6 structural cases in evals/cases-real/ against the REAL model,
#     with low token budget: short prompts, maxOutputTokens<=256, reasoning=low,
#     one short independent session per case.
#
# Usage:
#   powershell -NoProfile -ExecutionPolicy Bypass -File evals/real-smoke.ps1
#   powershell -NoProfile -ExecutionPolicy Bypass -File evals/real-smoke.ps1 -Exe <path> -Port 18903
#   powershell -NoProfile -ExecutionPolicy Bypass -File evals/real-smoke.ps1 -PriceIn 2 -PriceOut 8
#
# Token controls: SIMO_MAX_OUTPUT_TOKENS (default 256) + SIMO_REASONING_DEFAULT (default low).
# Cost estimate: pass -PriceIn/-PriceOut in CNY per 1M tokens; omit to only report tokens.
#
# SAFETY: temp SIMO_HOME + own port + only stops the PID it started. Never touches 8787.
# NOTE: keep this file ASCII-only (Windows PowerShell 5.1 misreads UTF-8 without BOM).

param(
  [string]$Exe = '',
  [int]$Port = 18903,
  [int]$MaxTokens = 256,
  [string]$Reasoning = 'low',
  [double]$PriceIn = 0,
  [double]$PriceOut = 0,
  [string]$Node = '',
  [int]$TokenBudget = 45000   # M20-B goal: real-smoke total tokens <= 45k after on-demand action discovery (0=off)
)

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot

if (-not $Node) {
  $Node = 'E:\dsh_home\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe'
  if (-not (Test-Path $Node)) { $Node = (Get-Command node).Source }
}
if (-not $Exe) { $Exe = Join-Path $repo 'toolchain\tmp\release\simo.exe' }
if (-not (Test-Path $Exe)) { Write-Host "FAIL: simo exe not found: $Exe"; exit 2 }

$config = Join-Path $repo 'backend\config.local.json'
if (-not (Test-Path $config)) {
  Write-Host "FAIL: real model config not found: $config"
  Write-Host "      create backend/config.local.json with provider/baseURL/model/apiKey (see docs/tech-stack.md)."
  exit 2
}

$work = Join-Path ([System.IO.Path]::GetTempPath()) ("simo-realsmoke-" + [guid]::NewGuid().ToString('N').Substring(0, 8))
$homeDir = Join-Path $work 'home'
New-Item -ItemType Directory -Force -Path $homeDir | Out-Null
$base = "http://127.0.0.1:$Port"
$log = Join-Path $work 'server.log'

Write-Host "workdir: $work"
Write-Host "exe: $Exe"
Write-Host "port: $Port   maxOutputTokens=$MaxTokens   reasoning=$Reasoning"
Write-Host ""

$env:SIMO_HOME = $homeDir
$env:SIMO_CONFIG = $config
$env:SIMO_MODEL = 'real'
$env:SIMO_LLM = 'deepseek'
$env:SIMO_MAX_OUTPUT_TOKENS = [string]$MaxTokens
$env:SIMO_REASONING_DEFAULT = $Reasoning
$env:SIMO_DEBUG = '1'   # needed by real-read-tool (debug request snapshot)

$proc = Start-Process -FilePath $Exe -ArgumentList 'serve', '-addr', ("127.0.0.1:" + $Port) `
  -RedirectStandardOutput $log -RedirectStandardError ($log + '.err') -WindowStyle Hidden -PassThru

$ready = $false
$deadline = (Get-Date).AddSeconds(20)
while ((Get-Date) -lt $deadline) {
  try {
    $r = Invoke-WebRequest ($base + '/api/health') -TimeoutSec 2 -UseBasicParsing
    if ($r.StatusCode -eq 200) { $ready = $true; break }
  } catch { Start-Sleep -Milliseconds 300 }
}
if (-not $ready) {
  $tail = (Get-Content ($log + '.err') -Tail 8 -ErrorAction SilentlyContinue) -join ' | '
  Write-Host "FAIL: server not ready in 20s. stderr: $tail"
  if ($proc) { Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue }
  exit 2
}
Write-Host "server ready: $base (real model)"
Write-Host ""

& $Node (Join-Path $repo 'evals\run.mjs') --real --base-url $base --price-in $PriceIn --price-out $PriceOut
$code = $LASTEXITCODE

Write-Host ''
Write-Host "--- final /api/usage ---"
$totalTokens = -1
try {
  $usage = Invoke-WebRequest ($base + '/api/usage') -TimeoutSec 5 -UseBasicParsing
  Write-Host $usage.Content
  try {
    $parsed = $usage.Content | ConvertFrom-Json
    if ($parsed.total -and $parsed.total.totalTokens) { $totalTokens = [int]$parsed.total.totalTokens }
  } catch { }
} catch {
  Write-Host "(usage endpoint unavailable)"
}

# token budget: single run is a SOFT warning only (milestone gate = median of 3 runs <= TokenBudget)
$budgetOk = $true
if ($TokenBudget -gt 0 -and $totalTokens -ge 0) {
  $budgetOk = $totalTokens -le $TokenBudget
  if ($budgetOk) {
    Write-Host ("[PASS] token budget: {0} <= {1}" -f $totalTokens, $TokenBudget)
  } else {
    Write-Host ("[WARN] token budget exceeded: {0} > {1} (single-run soft warning; milestone uses 3-run median)" -f $totalTokens, $TokenBudget)
  }
} elseif ($TokenBudget -gt 0) {
  Write-Host "[WARN] token budget not verifiable (/api/usage totalTokens missing)"
}

if ($proc) { Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue }
Write-Host "workdir kept for inspection: $work"

if ($code -eq 0) { exit 0 } else { exit $code }

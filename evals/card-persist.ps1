# card-persist.ps1 -- M41 card persistence across restart
#
# Starts the server on an isolated port/home, sends a card via chat.send_card,
# stops the server, restarts on the SAME home, then asserts:
#   - GET /api/messages still contains the card (cards[] / cardId / fallback)
#   - GET /api/cards/{cardId} still returns the card
# Owns its own port + workspace .tmp home; only stops its own PIDs.
#
# Usage: powershell -NoProfile -ExecutionPolicy Bypass -File evals/card-persist.ps1 [-Exe path] [-Port 19092]
# NOTE: keep this file ASCII-only (Windows PowerShell 5.1 misreads UTF-8 without BOM).

param(
  [string]$Exe = '',
  [int]$Port = 19092
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
$work = Join-Path $tmpRoot ("card-persist-" + [guid]::NewGuid().ToString('N').Substring(0, 8))
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
Remove-Item Env:AGENTD_RECALL_VECTOR -ErrorAction SilentlyContinue
Remove-Item Env:AGENTD_RECALL_R2 -ErrorAction SilentlyContinue
Remove-Item Env:AGENTD_MEMORY_CONSOLIDATE -ErrorAction SilentlyContinue

function Start-Backend {
  $log = Join-Path $work ('server-' + [guid]::NewGuid().ToString('N').Substring(0, 6) + '.log')
  $proc = Start-Process -FilePath $Exe -ArgumentList 'serve', '-addr', ("127.0.0.1:" + $Port), '-debug' `
    -RedirectStandardOutput $log -RedirectStandardError ($log + '.err') -WindowStyle Hidden -PassThru
  $deadline = (Get-Date).AddSeconds(25)
  while ((Get-Date) -lt $deadline) {
    try {
      if ((Invoke-WebRequest ($base + '/api/health') -TimeoutSec 2 -UseBasicParsing).StatusCode -eq 200) { return $proc }
    } catch { Start-Sleep -Milliseconds 300 }
  }
  Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
  return $null
}

function Get-Json([string]$path) {
  return (Invoke-WebRequest ($base + $path) -TimeoutSec 15 -UseBasicParsing).Content | ConvertFrom-Json
}
function Post-Json([string]$path, [hashtable]$body) {
  $json = $body | ConvertTo-Json -Depth 12 -Compress
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
  return ((Invoke-WebRequest ($base + $path) -Method Post -Body $bytes -ContentType 'application/json; charset=utf-8' -UseBasicParsing).Content | ConvertFrom-Json)
}

$proc = Start-Backend
Add-Check 'Backend starts' ($null -ne $proc) $base
if (-not $proc) { exit 1 }

try {
  $tag = [guid]::NewGuid().ToString('N').Substring(0, 8)
  $fallback = "PersistCardFallback-$tag"
  $sent = Post-Json '/api/actions/chat.send_card' @{
    sessionId = 'main'
    fallbackText = $fallback
    schema = @{
      schemaVersion = 1
      title = 'Persist card'
      blocks = @(@{ id = 't1'; type = 'text'; props = @{ text = 'persist probe' } })
      actions = @(@{ id = 'confirm'; label = 'Confirm'; route = 'agent'; action = 'chat.send'; prompt = 'confirm persist card'; variant = 'primary' })
      equivalence = @{ chatPrompt = 'confirm persist card' }
      layout = @{ kind = 'rows' }
    }
  }
  $cardId = [string]$sent.cardId
  if ([string]::IsNullOrWhiteSpace($cardId) -and $sent.data) { $cardId = [string]$sent.data.cardId }
  Add-Check 'Card sent before restart' ($sent.ok -eq $true -and -not [string]::IsNullOrWhiteSpace($cardId)) ("cardId=" + $cardId)
  if ([string]::IsNullOrWhiteSpace($cardId)) { throw 'no cardId' }

  $before = (Get-Json '/api/messages?sessionId=main' | ConvertTo-Json -Depth 20 -Compress)
  Add-Check 'Message carries card before restart' ($before -match [regex]::Escape($cardId) -and $before -match [regex]::Escape($fallback)) 'cardId+fallback present'

  Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
  Start-Sleep -Milliseconds 800
  $proc = Start-Backend
  Add-Check 'Backend restarts on same home' ($null -ne $proc) $base
  if (-not $proc) { throw 'restart failed' }

  $after = (Get-Json '/api/messages?sessionId=main' | ConvertTo-Json -Depth 20 -Compress)
  Add-Check 'Card survives restart in messages' ($after -match [regex]::Escape($cardId) -and $after -match [regex]::Escape($fallback)) 'cardId+fallback present'
  $card = Get-Json ("/api/cards/" + $cardId)
  Add-Check 'Card survives restart via GET /api/cards' ($card.ok -eq $true -and [string]$card.id -eq $cardId) ("version=" + $card.version)
} finally {
  if ($proc) { Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue }
}

Write-Host ''
$passed = $script:total - $script:failures.Count
Write-Host ("CARD PERSIST SUMMARY: {0}/{1} PASS" -f $passed, $script:total)
if ($script:failures.Count -gt 0) { Write-Host ("FAILED: " + ($script:failures -join '; ')) }
Write-Host "workdir: $work"
if ($script:failures.Count -gt 0) { exit 1 } else { exit 0 }

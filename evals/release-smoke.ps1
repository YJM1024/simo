# release-smoke.ps1 -- M7 single-binary cold-start release smoke (orchestrator)
#
# Why PowerShell orchestrates: this sandbox blocks Node from spawning child processes
# with pipes (EPERM), so process start/stop lives here; assertions are reused from
# evals/release-smoke.mjs --probe (HTTP/WS), which never spawns anything.
#
# Usage:
#   powershell -NoProfile -ExecutionPolicy Bypass -File evals/release-smoke.ps1
#   powershell -NoProfile -ExecutionPolicy Bypass -File evals/release-smoke.ps1 -SkipBuild
#   powershell -NoProfile -ExecutionPolicy Bypass -File evals/release-smoke.ps1 -Exe <path>
#
# NOTE: keep this file ASCII-only. Windows PowerShell 5.1 misreads UTF-8 without BOM,
#       and garbled bytes turn into parser errors.
#
# Covers: single-file delivery / cold start (health+homepage+WS+message) / restart persistence /
#         fresh home empty / preflight error / deploy static check.

param(
  [switch]$SkipBuild,
  [string]$Exe = '',
  [int]$Port = 0
)

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$node = 'E:\dsh_home\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe'
if (-not (Test-Path $node)) { $node = (Get-Command node).Source }

$script:failures = @()
$script:total = 0
function Add-Check([string]$name, [bool]$ok, [string]$note) {
  $script:total++
  $mark = if ($ok) { 'PASS' } else { 'FAIL' }
  Write-Host ("[{0}] {1}: {2}" -f $mark, $name, $note)
  if (-not $ok) { $script:failures += $name }
}

$work = Join-Path ([System.IO.Path]::GetTempPath()) ("agentd-release-" + [guid]::NewGuid().ToString('N').Substring(0, 8))
New-Item -ItemType Directory -Force -Path $work | Out-Null
Write-Host "workdir: $work"
Write-Host ''

if ($Port -eq 0) {
  $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
  $listener.Start()
  $Port = ($listener.LocalEndpoint).Port
  $listener.Stop()
}
$base = "http://127.0.0.1:$Port"
Write-Host "port: $Port"
Write-Host ''

# ---------------------------------------------------------------- 1) build
if (-not $Exe) { $Exe = Join-Path $repo 'toolchain\tmp\release\agentd.exe' }
if (-not $SkipBuild) {
  New-Item -ItemType Directory -Force -Path (Split-Path $Exe -Parent) | Out-Null
  $buildLog = Join-Path $work 'build.log'
  $buildLine = 'cd /d "{0}\agentd" && powershell -NoProfile -ExecutionPolicy Bypass -File "{1}\toolchain\go.ps1" build -o "{2}" ./cmd/agentd > "{3}" 2>&1' -f $repo, $repo, $Exe, $buildLog
  cmd.exe /d /c $buildLine
  $ok = ($LASTEXITCODE -eq 0) -and (Test-Path $Exe)
  $size = 0
  if (Test-Path $Exe) { $size = [math]::Round((Get-Item $Exe).Length / 1MB, 1) }
  if ($ok) { Add-Check 'Go full build (single binary)' $true "$size MB" }
  else {
    Add-Check 'Go full build (single binary)' $false "exit=$LASTEXITCODE (see $buildLog)"
    Get-Content $buildLog -Tail 15 -ErrorAction SilentlyContinue
  }
}

# ---------------------------------------------------------------- 2) single-file delivery
$binDir = Join-Path $work 'bin'
New-Item -ItemType Directory -Force -Path $binDir | Out-Null
$solo = Join-Path $binDir 'agentd.exe'
Copy-Item $Exe $solo -Force
$entries = @(Get-ChildItem $binDir | Select-Object -ExpandProperty Name)
$soloOk = ($entries.Count -eq 1) -and ($entries[0] -eq 'agentd.exe')
Add-Check 'Single-file delivery (exe stands alone)' $soloOk ("dir = [" + ($entries -join ', ') + "]")

function Start-Agentd([string]$homeDir, [string]$label) {
  New-Item -ItemType Directory -Force -Path $homeDir | Out-Null
  $log = Join-Path $work ($label + '.log')
  $env:AGENTD_HOME = $homeDir
  $env:AGENTD_LLM = 'mock'
  $env:AGENTD_DEBUG = '1'
  $p = Start-Process -FilePath $solo -ArgumentList 'serve', '-addr', ("127.0.0.1:" + $Port) `
    -RedirectStandardOutput $log -RedirectStandardError ($log + '.err') -WindowStyle Hidden -PassThru
  $deadline = (Get-Date).AddSeconds(20)
  $ready = $false
  while ((Get-Date) -lt $deadline) {
    try {
      $r = Invoke-WebRequest ($base + '/api/health') -TimeoutSec 2 -UseBasicParsing
      if ($r.StatusCode -eq 200) { $ready = $true; break }
    } catch { Start-Sleep -Milliseconds 250 }
  }
  return [pscustomobject]@{ Proc = $p; Ready = $ready; Log = $log; Home = $homeDir }
}

function Stop-Agentd($h) {
  if ($h -and $h.Proc) { Stop-Process -Id $h.Proc.Id -Force -ErrorAction SilentlyContinue }
  Start-Sleep -Milliseconds 300
}

$smokeScript = Join-Path $repo 'evals\release-smoke.mjs'

# ---------------------------------------------------------------- 3) cold start
$homeA = Join-Path $work 'home-a'
$probeId = 'release-smoke-' + [guid]::NewGuid().ToString('N').Substring(0, 8)
$a1 = Start-Agentd $homeA 'cold-start'
if ($a1.Ready) { Add-Check 'Cold start: server ready (/api/health 200)' $true $base }
else {
  $tail = (Get-Content $a1.Log -Tail 3 -ErrorAction SilentlyContinue) -join ' | '
  Add-Check 'Cold start: server ready (/api/health 200)' $false ("20s not ready; log: " + $tail)
}
& $node $smokeScript --probe --base-url $base --chat ($probeId + ' cold start message') --expect $probeId
Add-Check 'Cold start probe (homepage/WS/message persisted)' ($LASTEXITCODE -eq 0) ("probe exit=$LASTEXITCODE")
Stop-Agentd $a1

# ---------------------------------------------------------------- 4) restart persistence
$a2 = Start-Agentd $homeA 'restart'
& $node $smokeScript --probe --base-url $base --expect $probeId
Add-Check 'Restart keeps data (same AGENTD_HOME)' (($LASTEXITCODE -eq 0) -and $a2.Ready) ("restart exit=$LASTEXITCODE")
Stop-Agentd $a2

# ---------------------------------------------------------------- 5) fresh home -> empty
$homeB = Join-Path $work 'home-b'
$b1 = Start-Agentd $homeB 'fresh-home'
& $node $smokeScript --probe --base-url $base --expect-empty
Add-Check 'Fresh AGENTD_HOME -> empty data' (($LASTEXITCODE -eq 0) -and $b1.Ready) ("fresh-home exit=$LASTEXITCODE")
Stop-Agentd $b1

# ---------------------------------------------------------------- 6) preflight: unusable home
$blocker = Join-Path $work 'blocker'
Set-Content -Path $blocker -Value 'not a directory' -NoNewline
$badHome = Join-Path $blocker 'home'
$badLog = Join-Path $work 'preflight.log'
$env:AGENTD_HOME = $badHome
$badProc = Start-Process -FilePath $solo -ArgumentList 'serve', '-addr', ("127.0.0.1:" + $Port) `
  -RedirectStandardOutput $badLog -RedirectStandardError ($badLog + '.err') -WindowStyle Hidden -PassThru
$exited = $badProc.WaitForExit(12000)
if (-not $exited) { Stop-Process -Id $badProc.Id -Force -ErrorAction SilentlyContinue }
$errText = ''
if (Test-Path ($badLog + '.err')) { $errText = [string](Get-Content ($badLog + '.err') -Raw -ErrorAction SilentlyContinue) }
if (Test-Path $badLog) { $errText = $errText + [string](Get-Content $badLog -Raw -ErrorAction SilentlyContinue) }
$clear = $errText -match '(?i)(home|dir|path|creat|permission|denied|mkdir|mkdirall|open)'
$firstLine = ($errText -split "`r?`n" | Where-Object { $_.Trim() } | Select-Object -First 1)
if (-not $firstLine) { $firstLine = '(empty)' }
if ($firstLine.Length -gt 160) { $firstLine = $firstLine.Substring(0, 160) }
$exitCodeText = 'still running'
if ($exited) { $exitCodeText = [string]$badProc.ExitCode }
$preflightOk = $exited -and ($badProc.ExitCode -ne 0) -and $clear
Add-Check 'Preflight: unusable AGENTD_HOME reports clear error' $preflightOk ("exit=" + $exitCodeText + "; first line: " + $firstLine)

# ---------------------------------------------------------------- 7) deploy static check
Write-Host ''
Write-Host '--- deploy/ static check (no container runtime on this host -> not executed) ---'
& $node $smokeScript --deploy-check
Add-Check 'deploy/ static check' ($LASTEXITCODE -eq 0) ("deploy-check exit=$LASTEXITCODE")

# ---------------------------------------------------------------- summary
Write-Host ''
$failed = $script:failures.Count
$passed = $script:total - $failed
Write-Host ("SMOKE SUMMARY: {0}/{1} PASS" -f $passed, $script:total)
if ($failed -gt 0) { Write-Host ("FAILED: " + ($script:failures -join '; ')) }
Write-Host "workdir: $work"
if ($failed -gt 0) { exit 1 } else { exit 0 }

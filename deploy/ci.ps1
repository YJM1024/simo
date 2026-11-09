# deploy/ci.ps1 -- one-command local CI pipeline (Windows, mock model, workspace-local temp)
#
# Stages (each timed; any failure -> non-zero exit):
#   1) preflight   : tools / repo checks
#   2) go          : go vet + go test ./...  (simo)
#   3) web         : node frontend/build.mjs (tsc + tailwind + esbuild)  [skip with -SkipWeb]
#   4) build       : build simo.exe into .tmp\ci-<GUID>\simo.exe
#   5) evals       : mock evals in 4 blocks, fresh server + fresh GUID home per block
#   6) package     : deploy/package.ps1 -SkipBuild -> deploy\dist\simo-<ver>-win-x64.zip
#   7) docker      : docker compose config check when docker exists, else SKIP (never fails)
#
# Policy: all temp data under <repo>\.tmp\ci-<GUID>\ (never system Temp); no recursive deletes;
#         independent ports; never touches 8787 / simo-live.exe; no user approval prompts.
#
# Usage:
#   powershell -NoProfile -ExecutionPolicy Bypass -File deploy\ci.ps1
#   ... -SkipWeb           # web toolchain (pnpm/esbuild) not available -> skip stage
#   ... -SkipEvals         # fast go/build/package only
#   ... -SkipPackage       # no zip artifact
#   ... -Only "health,ws-order"   # run only these eval case ids
#   ... -PortBase 19000
#
# Exit codes: 0 all executed stages passed / 1 stage failure / 2 preflight failure
# NOTE: keep this file ASCII-only (Windows PowerShell 5.1 misreads UTF-8 without BOM).

param(
  [switch]$SkipWeb,
  [switch]$SkipGo,
  [switch]$SkipEvals,
  [switch]$SkipPackage,
  [switch]$SkipDocker,
  [string]$Only = '',
  [int]$PortBase = 19000,
  [string]$Version = ''
)

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$ciId = [guid]::NewGuid().ToString('N').Substring(0, 8)
$runDir = Join-Path $repo ('.tmp\ci-' + $ciId)
New-Item -ItemType Directory -Force -Path $runDir | Out-Null
$homeDir = Join-Path $runDir 'home'
New-Item -ItemType Directory -Force -Path $homeDir | Out-Null
$logs = Join-Path $runDir 'logs'
New-Item -ItemType Directory -Force -Path $logs | Out-Null
if (-not $Version) { $Version = 'CI-' + (Get-Date).ToString('yyyyMMdd-HHmm') }

$node = ''
foreach ($candidate in @('E:\dsh_home\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe', 'node')) {
  if ($candidate -eq 'node') { if (Get-Command node -ErrorAction SilentlyContinue) { $node = 'node' } }
  elseif (Test-Path $candidate) { $node = $candidate }
}
$goPs1 = Join-Path $repo 'toolchain\go.ps1'
$goBin = Join-Path $repo 'toolchain\go\bin\go.exe'

$script:results = @()
function Add-Stage([string]$name, [string]$status, [double]$seconds, [string]$note = '') {
  $script:results += [pscustomobject]@{ Stage = $name; Status = $status; Seconds = [math]::Round($seconds, 1); Note = $note }
  $mark = switch ($status) { 'PASS' { 'PASS' } 'SKIP' { 'SKIP' } default { 'FAIL' } }
  Write-Host ("[{0}] {1} ({2:n1}s){3}" -f $mark, $name, $seconds, $(if ($note) { ' -- ' + $note } else { '' }))
}
function Run-Stage([string]$name, [scriptblock]$body) {
  Write-Host ("[ci] === " + $name + " ===")
  $sw = [System.Diagnostics.Stopwatch]::StartNew()
  try {
    $ok = & $body
    $sw.Stop()
    if ($ok -eq $false) { Add-Stage $name 'FAIL' $sw.Elapsed.TotalSeconds; return $false }
    Add-Stage $name 'PASS' $sw.Elapsed.TotalSeconds
    return $true
  } catch {
    $sw.Stop()
    Add-Stage $name 'FAIL' $sw.Elapsed.TotalSeconds ($_.Exception.Message)
    return $false
  }
}
function Write-Log([string]$path, [string]$text) { Set-Content -Path $path -Value $text -Encoding UTF8 }
function Invoke-Go([string[]]$goArgs, [string]$logFile) {
  Push-Location (Join-Path $repo 'backend')
  try {
    if (Test-Path $goPs1) { $out = & $goPs1 @goArgs 2>&1 | Out-String } elseif (Test-Path $goBin) { $out = & $goBin @goArgs 2>&1 | Out-String } else { $out = & go @goArgs 2>&1 | Out-String }
    $code = $LASTEXITCODE
    Write-Log $logFile $out
    if ($code -ne 0) { Write-Host $out; return $false }
    return $true
  } finally { Pop-Location }
}

Write-Host ("[ci] repo: " + $repo)
Write-Host ("[ci] run dir: " + $runDir)
Write-Host ("[ci] version: " + $Version)

# ---------------------------------------------------------------- 1) preflight
$pre = Run-Stage 'preflight' {
  if (-not (Test-Path (Join-Path $repo 'backend\go.mod'))) { throw 'backend/go.mod not found' }
  if (-not (Test-Path (Join-Path $repo 'evals\run.mjs'))) { throw 'evals/run.mjs not found' }
  if (-not $node) { throw 'node not found (set PATH or use the bundled node)' }
  if (-not (Test-Path $goPs1) -and -not (Test-Path $goBin) -and -not (Get-Command go -ErrorAction SilentlyContinue)) { throw 'Go toolchain not found' }
  Write-Host ("       node: " + $node)
  $true
}
if (-not $pre) { Write-Host '[ci] preflight failed'; exit 2 }

# ---------------------------------------------------------------- 2) go vet + test
if ($SkipGo) {
  Add-Stage 'go' 'SKIP' 0 '-SkipGo'
} else {
  $goOk = Run-Stage 'go' {
    $vet = Invoke-Go @('vet', './...') (Join-Path $logs 'go-vet.log')
    if (-not $vet) { throw 'go vet failed (see go-vet.log)' }
    $test = Invoke-Go @('test', './...') (Join-Path $logs 'go-test.log')
    if (-not $test) { throw 'go test failed (see go-test.log)' }
    $true
  }
}

# ---------------------------------------------------------------- 3) web (optional)
if ($SkipWeb) {
  Add-Stage 'frontend' 'SKIP' 0 '-SkipWeb (pnpm/esbuild native toolchain unavailable)'
} else {
  $null = Run-Stage 'frontend' {
    $buildScript = Join-Path $repo 'frontend\build.mjs'
    if (-not (Test-Path $buildScript)) { throw 'frontend/build.mjs not found' }
    Push-Location (Join-Path $repo 'frontend')
    try { $out = & $node 'build.mjs' 2>&1 | Out-String; $code = $LASTEXITCODE } finally { Pop-Location }
    Write-Log (Join-Path $logs 'web-build.log') $out
    if ($code -ne 0) { Write-Host $out; throw "web build failed (exit $code)" }
    $frontendDist = Join-Path $repo 'frontend\dist'
    $embedDist = Join-Path $repo 'backend\internal\webui\dist'
    if (-not (Test-Path (Join-Path $frontendDist 'index.html'))) { throw 'frontend/dist/index.html not produced' }
    New-Item -ItemType Directory -Force -Path $embedDist | Out-Null
    Copy-Item -Path (Join-Path $frontendDist '*') -Destination $embedDist -Recurse -Force
    $true
  }
}

# ---------------------------------------------------------------- 4) build simo.exe
$exePath = Join-Path $runDir 'simo.exe'
$buildOk = Run-Stage 'build' {
  $null = Invoke-Go @('build', '-trimpath', '-buildvcs=false', '-ldflags', '-s -w', '-o', $exePath, './cmd/simo') (Join-Path $logs 'go-build.log')
  if (-not (Test-Path $exePath)) { throw 'simo.exe not produced' }
  Write-Host ("       exe: " + $exePath + " (" + [math]::Round((Get-Item $exePath).Length / 1MB, 2) + " MB)")
  $true
}
if (-not $buildOk) {
  Write-Host '[ci] build failed; skipping evals/package'
}

# ---------------------------------------------------------------- 5) mock evals (4 blocks, fresh server + home)
function Get-BlockIds {
  $files = Get-ChildItem (Join-Path $repo 'evals\cases') -Filter *.json | Sort-Object Name
  $rows = foreach ($f in $files) {
    $j = Get-Content $f.FullName -Raw | ConvertFrom-Json
    $m = [regex]::Match($f.Name, '^(\d+)-')
    $num = if ($m.Success) { [int]$m.Groups[1].Value } else { 9999 }
    [pscustomobject]@{ Num = $num; Id = [string]$j.id; Pending = ($j.pending -eq $true) }
  }
  return @(
    @{ Name = 'M1-M8'; Ids = @($rows | Where-Object { $_.Num -le 34 } | Select-Object -ExpandProperty Id) },
    @{ Name = 'M9-M15'; Ids = @($rows | Where-Object { $_.Num -ge 35 -and $_.Num -le 67 } | Select-Object -ExpandProperty Id) },
    @{ Name = 'M17-M20'; Ids = @($rows | Where-Object { $_.Num -ge 68 -and $_.Num -le 94 } | Select-Object -ExpandProperty Id) },
    @{ Name = 'M21+'; Ids = @($rows | Where-Object { $_.Num -ge 95 } | Select-Object -ExpandProperty Id) }
  )
}
if ($SkipEvals -or -not $buildOk) {
  Add-Stage 'evals' 'SKIP' 0 $(if ($SkipEvals) { '-SkipEvals' } else { 'build failed' })
} else {
  $blocks = Get-BlockIds
  $blockIndex = 0
  foreach ($block in $blocks) {
    $blockIndex++
    $ids = if ($Only) { ($Only -split ',') } else { $block.Ids }
    $log = Join-Path $logs ('evals-' + $block.Name + '.log')
    $port = $PortBase + $blockIndex
    $blockHome = Join-Path $runDir ('home-b' + $blockIndex)
    New-Item -ItemType Directory -Force -Path $blockHome | Out-Null
    $name = 'evals/' + $block.Name
    $ok = Run-Stage $name {
      $env:SIMO_HOME = $blockHome; $env:SIMO_LLM = 'mock'; $env:SIMO_DEBUG = '1'
      $env:SIMO_MODEL = 'mock'
      $srvOut = Join-Path $logs ('server-b' + $blockIndex + '.out.log')
      $srvErr = Join-Path $logs ('server-b' + $blockIndex + '.err.log')
      $proc = Start-Process -FilePath $exePath -ArgumentList @('serve', '-addr', ("127.0.0.1:" + $port), '-model', 'mock') `
        -PassThru -WindowStyle Hidden -RedirectStandardOutput $srvOut -RedirectStandardError $srvErr
      try {
        $ready = $false
        $deadline = (Get-Date).AddSeconds(90)
        while ((Get-Date) -lt $deadline) {
          if ($proc.HasExited) { break }
          try { if ((Invoke-WebRequest ('http://127.0.0.1:' + $port + '/api/health') -UseBasicParsing -TimeoutSec 2).StatusCode -eq 200) { $ready = $true; break } } catch { }
          Start-Sleep -Milliseconds 300
        }
        if (-not $ready) { throw ("server not ready on port " + $port) }
        $env:SIMO_HOME = $blockHome
        $out = & $node (Join-Path $repo 'evals\run.mjs') --base-url ('http://127.0.0.1:' + $port) --cli $exePath --only ($ids -join ',') 2>&1 | Out-String
        Write-Log $log $out
        if ($LASTEXITCODE -ne 0) { Write-Host ($out -split "`n" | Select-Object -Last 15 | Out-String); throw ("evals failed: " + $block.Name + " (see " + $log + ")") }
        Write-Host ('       ' + $block.Name + ': ' + (($out -split "`n" | Where-Object { $_ -match 'WITH ' } | Select-Object -Last 1)))
        $true
      } finally {
        if (-not $proc.HasExited) { Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue }
        Start-Sleep -Milliseconds 400
      }
    }
    if (-not $ok) { Write-Host '[ci] evals block failed; stopping eval blocks'; break }
  }
}

# ---------------------------------------------------------------- 6) package
if ($SkipPackage -or -not $buildOk) {
  Add-Stage 'package' 'SKIP' 0 $(if ($SkipPackage) { '-SkipPackage' } else { 'build failed' })
} else {
  $null = Run-Stage 'package' {
    $pkgOut = Join-Path $repo 'deploy\dist'
    New-Item -ItemType Directory -Force -Path $pkgOut | Out-Null
    $out = & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $repo 'deploy\package.ps1') `
      -SkipBuild -Exe $exePath -Version $Version -OutDir $pkgOut -Force 2>&1 | Out-String
    Write-Log (Join-Path $logs 'package.log') $out
    if ($LASTEXITCODE -ne 0) { Write-Host $out; throw 'package.ps1 failed' }
    $zip = Get-ChildItem $pkgOut -Filter ('simo-' + $Version + '-win-x64.zip') | Select-Object -First 1
    if (-not $zip) { throw 'package zip not found after package.ps1' }
    Write-Host ('       artifact: ' + $zip.FullName)
    $true
  }
}

# ---------------------------------------------------------------- 7) docker (optional, never fails)
if ($SkipDocker) {
  Add-Stage 'docker' 'SKIP' 0 '-SkipDocker'
} else {
  $dockerExe = Get-Command docker -ErrorAction SilentlyContinue
  if (-not $dockerExe) {
    Add-Stage 'docker' 'SKIP' 0 'docker not installed (static Dockerfile/compose checks only)'
  } else {
    $null = Run-Stage 'docker' {
      Push-Location $repo
      try { $out = & docker compose -f deploy\compose.yaml config 2>&1 | Out-String; $code = $LASTEXITCODE } finally { Pop-Location }
      Write-Log (Join-Path $logs 'docker-compose-config.log') $out
      if ($code -ne 0) { Write-Host $out; throw 'docker compose config failed' }
      $true
    }
  }
}

# ---------------------------------------------------------------- summary
Write-Host ''
Write-Host '================ CI SUMMARY ================'
$script:results | Format-Table -AutoSize | Out-String | Write-Host
$failed = @($script:results | Where-Object { $_.Status -eq 'FAIL' })
$total = ($script:results | Measure-Object -Property Seconds -Sum).Sum
Write-Host ("logs:      " + $logs)
Write-Host ("artifacts: " + (Join-Path $repo 'deploy\dist'))
Write-Host ("duration:  " + [math]::Round($total, 1) + "s")
if ($failed.Count -gt 0) {
  Write-Host ("RESULT: FAIL (" + $failed.Count + " stage(s)): " + (($failed | ForEach-Object { $_.Stage }) -join ', '))
  exit 1
}
Write-Host 'RESULT: PASS'
exit 0

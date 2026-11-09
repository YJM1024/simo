# Simo Docker one-click install for Windows (install to E: drive)
#
# Usage: open PowerShell as Administrator, then run:
#   powershell -NoProfile -ExecutionPolicy Bypass -File deploy\docker-install.ps1
#
# What it does:
#   - requires Administrator (Docker Desktop + WSL2 backend)
#   - installs to E:\Docker, Docker/WSL data root E:\Docker\data (never C:)
#   - enables VirtualMachinePlatform (WSL2 backend)
#   - downloads the official Docker Desktop installer to E:\Docker\installer
#   - silent install with --installation-dir / --wsl-default-data-root
#   - asks for a logoff/reboot afterwards
#   - writes a transcript to E:\Docker\install.log
#
# NOTE: keep this file ASCII-only. Windows PowerShell 5.1 misreads UTF-8 without BOM.

param(
  [string]$InstallDir = 'E:\Docker',
  [string]$DataRoot   = 'E:\Docker\data',
  [string]$InstallerUrl = 'https://desktop.docker.com/win/main/amd64/Docker%20Desktop%20Installer.exe',
  [string]$InstallerUrlFallback = 'https://desktop.docker.com/win/main/amd64/Docker%20Desktop%20Installer.exe?direct',
  [switch]$SkipWSLInstall
)

$ErrorActionPreference = 'Stop'
function Info([string]$m) { Write-Host ("[docker-install] " + $m) }
function Fail([string]$m) { Write-Host ("[docker-install] ERROR: " + $m); exit 1 }

# ---- admin check
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) { Fail "Administrator required: right-click PowerShell -> Run as administrator, then run this script again." }

# ---- target dirs (E:, never C:)
foreach ($p in @($InstallDir, $DataRoot)) {
  if ($p -match '^[Cc]:') { Fail "target directory must not be on C: $p" }
  if (-not (Test-Path $p)) { New-Item -ItemType Directory -Force -Path $p | Out-Null }
}
$installerDir = Join-Path $InstallDir 'installer'
if (-not (Test-Path $installerDir)) { New-Item -ItemType Directory -Force -Path $installerDir | Out-Null }
$installer = Join-Path $installerDir 'DockerDesktopInstaller.exe'
$logPath = Join-Path $InstallDir 'install.log'
try { Start-Transcript -Path $logPath -Append -Force | Out-Null } catch { }
Info ("log: " + $logPath)
Info ("OS: " + [Environment]::OSVersion.VersionString)

# ---- WSL2 feature (Docker Desktop backend); never abort here
if (-not $SkipWSLInstall) {
  Info "enabling WSL2 features (a reboot may be required) ..."
  try { & wsl.exe --install --no-distribution 2>&1 | Out-Host } catch { Info ("wsl --install failed: " + $_.Exception.Message) }
  try {
    Enable-WindowsOptionalFeature -Online -FeatureName VirtualMachinePlatform -NoRestart -ErrorAction Stop | Out-Null
    Info "VirtualMachinePlatform enabled"
  } catch { Info ("Enable VirtualMachinePlatform failed (may already be enabled): " + $_.Exception.Message) }
}

# ---- download installer (try curl.exe first, then Invoke-WebRequest, then fallback URL)
function Download([string]$url, [string]$dest) {
  Info ("downloading: " + $url)
  $curl = Get-Command curl.exe -ErrorAction SilentlyContinue
  if ($curl) {
    # native tools write progress/errors to stderr; run with Continue so a stderr line
    # never becomes a terminating NativeCommandError while $ErrorActionPreference = Stop
    $prevEap = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
      & $curl.Source -L --fail --retry 3 --connect-timeout 30 --silent --show-error -o $dest $url 2>&1 | Out-Host
    } finally { $ErrorActionPreference = $prevEap }
    if ($LASTEXITCODE -eq 0 -and (Test-Path $dest) -and ((Get-Item $dest).Length -gt 100MB)) { return $true }
    Info ("curl exit code: " + $LASTEXITCODE)
  }
  try {
    $old = $ProgressPreference; $ProgressPreference = 'SilentlyContinue'
    Invoke-WebRequest -Uri $url -OutFile $dest -UseBasicParsing
    $ProgressPreference = $old
    if ((Get-Item $dest).Length -gt 100MB) { return $true }
  } catch { Info ("Invoke-WebRequest failed: " + $_.Exception.Message) }
  if (Test-Path $dest) { Remove-Item $dest -Force -ErrorAction SilentlyContinue }
  return $false
}

if (-not (Test-Path $installer)) {
  $ok = Download $InstallerUrl $installer
  if (-not $ok) { $ok = Download $InstallerUrlFallback $installer }
  if (-not $ok) { Fail ("installer download failed. Download it manually in a browser and save as " + $installer + " , then rerun with -SkipWSLInstall if needed.") }
} else {
  Info "installer already present, skipping download: $installer"
}
$sizeMb = [math]::Round((Get-Item $installer).Length / 1MB, 1)
$hash = (Get-FileHash $installer -Algorithm SHA256).Hash.ToLowerInvariant()
Info ("installer: " + $installer + "  " + $sizeMb + " MB  sha256=" + $hash)

# ---- silent install to E:
$installArgs = @(
  'install', '--quiet', '--accept-license',
  '--installation-dir', $InstallDir,
  '--wsl-default-data-root', $DataRoot,
  '--backend', 'wsl-2'
)
Info ("silent install into " + $InstallDir + " (data root " + $DataRoot + ") ...")
$proc = Start-Process -FilePath $installer -ArgumentList $installArgs -Wait -PassThru
Info ("installer exit code: " + $proc.ExitCode)
if ($proc.ExitCode -ne 0) { Fail ("Docker Desktop installer exited with code " + $proc.ExitCode + " (see " + $logPath + ")") }

# ---- verify
$candidates = @(
  (Join-Path $InstallDir 'Docker Desktop.exe'),
  (Join-Path $InstallDir 'resources\bin\docker.exe'),
  (Join-Path $InstallDir 'DockerDesktop.exe')
)
$found = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if ($found) { Info ("installed: " + $found) } else { Info "installer returned 0 but expected Docker Desktop files were not found under $InstallDir (a reboot may be required)." }

Info "install finished. Please log off / reboot once, then start Docker Desktop."
Info "verify: docker version"
Info ("data root: " + $DataRoot + " (if Docker Desktop -> Settings -> Resources -> Advanced still shows C:, change Disk image location to " + $DataRoot + ")")
try { Stop-Transcript | Out-Null } catch { }

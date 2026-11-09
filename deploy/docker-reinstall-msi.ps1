# Simo helper: uninstall Docker Desktop and reinstall it onto E: drive
#
# Why: the first silent install ignored "--installation-dir E:\Docker" (space form) and
# installed to C:\Program Files\Docker\Docker (~4 GB). Docker's installer accepts the
# quoted equals form: --installation-dir="E:\Docker\Docker" (same for data roots).
#
# Usage: open PowerShell as Administrator, then run:
#   powershell -NoProfile -ExecutionPolicy Bypass -File deploy\docker-reinstall-msi.ps1
#
# Notes:
# - asks no questions; logs to E:\Docker\reinstall.log
# - stops Docker Desktop / com.docker.service first (only those processes)
# - keeps data root on E:\Docker\data; WSL images/data stay off C
# - reboot after it finishes, then start Docker Desktop
# - ASCII only: Windows PowerShell 5.1 misreads UTF-8 without BOM

param(
  [string]$InstallDir = 'E:\Docker\Docker',
  [string]$DataRoot   = 'E:\Docker\data',
  [string]$WindowsContainersRoot = 'E:\Docker\windows-containers',
  [string]$Installer = 'E:\Docker\installer\DockerDesktopInstaller.exe',
  [string]$InstallerUrl = 'https://desktop.docker.com/win/main/amd64/Docker%20Desktop%20Installer.exe'
)

$ErrorActionPreference = 'Stop'
function Info([string]$m) { Write-Host ("[docker-reinstall] " + $m) }
function Fail([string]$m) { Write-Host ("[docker-reinstall] ERROR: " + $m); exit 1 }

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) { Fail "Administrator required: right-click PowerShell -> Run as administrator." }

foreach ($p in @($InstallDir, $DataRoot, $WindowsContainersRoot)) {
  if ($p -match '^[Cc]:') { Fail "target must not be on C: $p" }
  if (-not (Test-Path $p)) { New-Item -ItemType Directory -Force -Path $p | Out-Null }
}
$logPath = 'E:\Docker\reinstall.log'
try { Start-Transcript -Path $logPath -Append -Force | Out-Null } catch { }
Info ("log: " + $logPath)

# ---- stop Docker processes/services (never kill unrelated processes)
Info "stopping Docker Desktop and com.docker.service ..."
Get-Process -Name 'Docker Desktop', 'com.docker.backend', 'com.docker.build' -ErrorAction SilentlyContinue | ForEach-Object {
  try { Stop-Process -Id $_.Id -Force -ErrorAction Stop; Info ("stopped process " + $_.ProcessName) } catch { }
}
try { Stop-Service -Name 'com.docker.service' -Force -ErrorAction Stop; Info "stopped com.docker.service" } catch { Info "com.docker.service not running/absent" }

# ---- uninstall existing Docker Desktop
$uninstalled = $false
$installerExe = 'C:\Program Files\Docker\Docker\Docker Desktop Installer.exe'
if (Test-Path $installerExe) {
  Info "uninstalling existing Docker Desktop (from C:) ..."
  $p = Start-Process -FilePath $installerExe -ArgumentList @('uninstall','--quiet') -Wait -PassThru
  Info ("uninstaller exit code: " + $p.ExitCode)
  $uninstalled = $true
} else {
  $keys = @(
    'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*',
    'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*'
  )
  foreach ($k in $keys) {
    $entry = Get-ItemProperty $k -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -match 'Docker Desktop' } | Select-Object -First 1
    if ($entry) {
      Info ("uninstalling via registry: " + $entry.DisplayName)
      $cmd = $entry.UninstallString
      if ($cmd) {
        $p = Start-Process -FilePath 'cmd.exe' -ArgumentList ('/c ' + $cmd + ' --quiet') -Wait -PassThru
        Info ("uninstaller exit code: " + $p.ExitCode)
        $uninstalled = $true
      }
    }
  }
}
if (-not $uninstalled) { Info "no existing Docker Desktop installation found (continuing)" }
Start-Sleep -Seconds 3

# ---- ensure installer is present (594 MB); reuse the one already on E:
if (-not (Test-Path $Installer)) {
  Info "installer not found, downloading ..."
  $prevEap = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
  try { & curl.exe -L --fail --retry 3 --connect-timeout 30 --silent --show-error -o $Installer $InstallerUrl 2>&1 | Out-Host } finally { $ErrorActionPreference = $prevEap }
  if (-not (Test-Path $Installer)) { Fail "download failed; download the installer manually to $Installer and rerun." }
}
Info ("installer: " + $Installer + "  " + [math]::Round((Get-Item $Installer).Length/1MB,1) + " MB")

# ---- reinstall to E: (quoted equals form is what the installer actually honors)
$installArgs = @(
  'install', '--quiet', '--accept-license', '--backend=wsl-2', '--no-windows-containers',
  ('--installation-dir="' + $InstallDir + '"'),
  ('--wsl-default-data-root="' + $DataRoot + '"'),
  ('--windows-containers-default-data-root="' + $WindowsContainersRoot + '"')
)
Info ("reinstalling into " + $InstallDir + " ...")
$proc = Start-Process -FilePath $Installer -ArgumentList $installArgs -Wait -PassThru
Info ("installer exit code: " + $proc.ExitCode)
if ($proc.ExitCode -ne 0) { Fail ("Docker Desktop installer exited with code " + $proc.ExitCode + " (see " + $logPath + ")") }

# ---- verify
$exe = Join-Path $InstallDir 'Docker Desktop.exe'
$cli = Join-Path $InstallDir 'resources\bin\docker.exe'
if (Test-Path $exe) { Info ("installed: " + $exe) } else { Info ("WARNING: expected " + $exe + " - inspect " + $logPath) }
if (Test-Path $cli) { Info ("cli: " + $cli) } else { Info ("WARNING: expected " + $cli) }

Info "done. Reboot Windows, then start Docker Desktop."
Info ("data root: " + $DataRoot)
try { Stop-Transcript | Out-Null } catch { }

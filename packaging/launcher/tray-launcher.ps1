# Tournament Master — System Tray Launcher (Phase 11b)

param(
  [Parameter(Mandatory = $true)]
  [string]$InstallDir
)

$ErrorActionPreference = "Stop"
$launcherDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$installRoot = Split-Path -Parent $launcherDir
. (Join-Path $installRoot "scripts\InstallDirUtils.ps1")
$InstallDir = Normalize-TournamentInstallDir -RawPath $InstallDir

$StartBat = Join-Path $InstallDir "start.bat"
$StopBat = Join-Path $InstallDir "stop.bat"
$RestartScript = Join-Path $InstallDir "scripts\restart-server.ps1"
$ResolvePortScript = Join-Path $InstallDir "scripts\resolve-http-port.ps1"
$EnsurePortScript = Join-Path $InstallDir "scripts\ensure-port.ps1"
$IconPath = Join-Path $InstallDir "assets\logoexe.ico"
if (-not (Test-Path $IconPath)) {
  $IconPath = Join-Path $InstallDir "assets\app-icon.ico"
}

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$script:ServerProcess = $null

function Read-CurrentPort {
  if (-not (Test-Path $ResolvePortScript)) { return 3000 }
  return [int](& $ResolvePortScript -InstallDir $InstallDir)
}

function Update-TrayText {
  $port = Read-CurrentPort
  $notify.Text = "Tournament Master (port $port)"
}

function Open-Director {
  $port = Read-CurrentPort
  $openScript = Join-Path $InstallDir "scripts\open-director-browser.ps1"
  if (Test-Path $openScript) {
    & powershell -NoProfile -ExecutionPolicy Bypass -File $openScript -Url "http://localhost:$port/"
    return
  }
  Start-Process "http://localhost:$port/#tm=$([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())"
}

function Test-OurServerRunning {
  if (-not (Test-Path $EnsurePortScript)) { return $false }
  $null = & $EnsurePortScript -InstallDir $InstallDir -PreferredPort 3000 -FallbackPort 3001 2>$null
  return $LASTEXITCODE -eq 3
}

function Start-Server {
  if (Test-OurServerRunning) {
    Update-TrayText
    Open-Director
    return
  }

  if ($script:ServerProcess -and -not $script:ServerProcess.HasExited) {
    [System.Windows.Forms.MessageBox]::Show("Tournament Master is already running.", "Tournament Master")
    return
  }

  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = "cmd.exe"
  $psi.Arguments = "/c `"$StartBat`""
  $psi.WorkingDirectory = $InstallDir
  $psi.WindowStyle = [System.Diagnostics.ProcessWindowStyle]::Minimized
  $psi.UseShellExecute = $false
  $script:ServerProcess = [System.Diagnostics.Process]::Start($psi)

  Start-Sleep -Seconds 4
  Update-TrayText
}

function Stop-Server {
  if (Test-Path $StopBat) {
    & cmd.exe /c "`"$StopBat`""
  }

  if ($script:ServerProcess -and -not $script:ServerProcess.HasExited) {
    Start-Sleep -Seconds 2
    if (-not $script:ServerProcess.HasExited) {
      $script:ServerProcess.Kill()
    }
  }
  $script:ServerProcess = $null
  Update-TrayText
}

function Restart-Server {
  if (-not (Test-Path $RestartScript)) {
    Stop-Server
    Start-Sleep -Seconds 2
    Start-Server
    return
  }

  & powershell -NoProfile -ExecutionPolicy Bypass -STA -File $RestartScript -InstallDir $InstallDir
  Start-Sleep -Seconds 4
  $script:ServerProcess = $null
  Update-TrayText
}

$notify = New-Object System.Windows.Forms.NotifyIcon
if (Test-Path $IconPath) {
  $notify.Icon = New-Object System.Drawing.Icon $IconPath
} else {
  $notify.Icon = [System.Drawing.SystemIcons]::Application
}
$notify.Text = "Tournament Master"
$notify.Visible = $true

$menu = New-Object System.Windows.Forms.ContextMenuStrip
[void]$menu.Items.Add("Open Director", $null, { Open-Director })
[void]$menu.Items.Add("Start Server", $null, { Start-Server })
[void]$menu.Items.Add("Restart Server", $null, { Restart-Server })
[void]$menu.Items.Add("Stop Server", $null, { Stop-Server })
[void]$menu.Items.Add("-")
[void]$menu.Items.Add("Exit Tray", $null, {
  $notify.Visible = $false
  [System.Windows.Forms.Application]::Exit()
})

$notify.ContextMenuStrip = $menu
$notify.Add_DoubleClick({ Open-Director })
Update-TrayText

Start-Server

[System.Windows.Forms.Application]::Run()

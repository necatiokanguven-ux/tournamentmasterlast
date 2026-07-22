# Graceful restart helper (F11b.6.3) — prefers PM2 when available
param(
  [Parameter(Mandatory = $true)]
  [string]$InstallDir,

  [int]$HttpPort = 0
)

$ErrorActionPreference = "Stop"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $scriptDir "InstallDirUtils.ps1")
$InstallDir = Normalize-TournamentInstallDir -RawPath $InstallDir
$StartBat = Join-Path $InstallDir "start.bat"
$NodeExe = & (Join-Path $InstallDir "scripts\ensure-runtime.ps1") -InstallDir $InstallDir
$Pm2Bin = Join-Path $InstallDir "node_modules\pm2\bin\pm2"

if ($HttpPort -le 0) {
  $HttpPort = [int](& (Join-Path $InstallDir "scripts\resolve-http-port.ps1") -InstallDir $InstallDir)
}

if (Test-Path $Pm2Bin) {
  Write-Host "Restarting Tournament Master via PM2..."
  & $NodeExe $Pm2Bin restart tournament-master
  Start-Sleep -Seconds 2
  & $NodeExe $Pm2Bin restart tournament-master-watchdog
  exit 0
}

Write-Host "Stopping Tournament Master on port $HttpPort..."
& (Join-Path $InstallDir "scripts\graceful-stop.ps1") -InstallDir $InstallDir -HttpPort $HttpPort
Start-Sleep -Seconds 2

Write-Host "Starting Tournament Master..."
$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = "cmd.exe"
$psi.Arguments = "/c `"$StartBat`""
$psi.WorkingDirectory = $InstallDir
$psi.UseShellExecute = $true
[void][System.Diagnostics.Process]::Start($psi)

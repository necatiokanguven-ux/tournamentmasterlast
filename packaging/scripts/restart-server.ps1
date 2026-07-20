# Graceful restart helper (F11b.6.3)
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

if ($HttpPort -le 0) {
  $HttpPort = [int](& (Join-Path $InstallDir "scripts\resolve-http-port.ps1") -InstallDir $InstallDir)
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

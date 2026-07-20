param(
  [Parameter(Mandatory = $true)]
  [string]$InstallDir
)

$ErrorActionPreference = "Stop"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $scriptDir "InstallDirUtils.ps1")
$InstallDir = Normalize-TournamentInstallDir -RawPath $InstallDir
$InstalledMarker = Join-Path $InstallDir ".installed"
$InstalledDataRoot = Join-Path $InstallDir "data"
$PortableRoot = Join-Path $InstallDir "data"

if ($env:TM_DATA_DIR) {
  Write-Output $env:TM_DATA_DIR.TrimEnd("\")
  exit 0
}

if (Test-Path $InstalledMarker) {
  New-Item -ItemType Directory -Path $InstalledDataRoot -Force | Out-Null
  Write-Output $InstalledDataRoot
  exit 0
}

New-Item -ItemType Directory -Path $PortableRoot -Force | Out-Null
Write-Output $PortableRoot

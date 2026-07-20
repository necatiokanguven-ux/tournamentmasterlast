param(
  [Parameter(Mandatory = $true)]
  [string]$InstallDir,

  [int]$DefaultPort = 3000
)

$ErrorActionPreference = "Stop"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $scriptDir "InstallDirUtils.ps1")
$InstallDir = Normalize-TournamentInstallDir -RawPath $InstallDir
$DataRoot = & (Join-Path $scriptDir "resolve-data-dir.ps1") -InstallDir $InstallDir
$PortFile = Join-Path $DataRoot "current-port.txt"

if (Test-Path $PortFile) {
  $value = (Get-Content $PortFile -ErrorAction SilentlyContinue | Select-Object -First 1).Trim()
  if ($value -match '^\d+$') {
    $port = [int]$value
    if ($port -gt 0 -and $port -le 65535) {
      Write-Output $port
      exit 0
    }
  }
}

Write-Output $DefaultPort

param(
  [Parameter(Mandatory = $true, Position = 0)]
  [string]$InstallDir
)

. (Join-Path $PSScriptRoot "InstallDirUtils.ps1")
Normalize-TournamentInstallDir -RawPath $InstallDir

param(
  [Parameter(Mandatory = $true)]
  [string]$InstallDir
)

$ErrorActionPreference = "Stop"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $scriptDir "InstallDirUtils.ps1")
$InstallDir = Normalize-TournamentInstallDir -RawPath $InstallDir
$EmbeddedNode = Join-Path $InstallDir "runtime\node.exe"

if (Test-Path $EmbeddedNode) {
  Write-Output $EmbeddedNode
  exit 0
}

$pathNode = Get-Command node -ErrorAction SilentlyContinue
if ($pathNode) {
  Write-Output $pathNode.Source
  exit 0
}

Write-Host "ERROR: Node.js not found."
Write-Host "Install Node 18+ from https://nodejs.org/ or bundle runtime\node.exe (Phase 11b)."
exit 1

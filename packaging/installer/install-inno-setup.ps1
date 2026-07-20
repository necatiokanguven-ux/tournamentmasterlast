# Install Inno Setup 6 via winget when missing (build machine helper)
param(
  [switch]$Quiet
)

$ErrorActionPreference = "Stop"

function Get-IsccPath {
  $candidates = @(
    "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe",
    "$env:ProgramFiles\Inno Setup 6\ISCC.exe",
    (Join-Path $env:LOCALAPPDATA "Programs\Inno Setup 6\ISCC.exe")
  )

  foreach ($iscc in $candidates) {
    if (Test-Path $iscc) {
      return $iscc
    }
  }

  return $null
}

$existing = Get-IsccPath
if ($existing) {
  Write-Host "Inno Setup already installed: $existing"
  Write-Output $existing
  exit 0
}

$winget = Get-Command winget -ErrorAction SilentlyContinue
if (-not $winget) {
  Write-Host "winget not found. Install Inno Setup 6 manually: https://jrsoftware.org/isdl.php"
  exit 1
}

Write-Host "Installing Inno Setup 6 via winget..."
$wingetArgs = @(
  "install", "-e", "--id", "JRSoftware.InnoSetup",
  "--accept-package-agreements", "--accept-source-agreements"
)
if ($Quiet) {
  $wingetArgs += "--silent"
}

& winget @wingetArgs | Out-Host
if ($LASTEXITCODE -ne 0) {
  Write-Host "winget install failed (exit $LASTEXITCODE)."
  exit $LASTEXITCODE
}

Start-Sleep -Seconds 2
$installed = Get-IsccPath
if ($installed) {
  Write-Host "Installed: $installed"
  Write-Output $installed
  exit 0
}

Write-Host "Inno Setup install finished but ISCC.exe not found."
exit 1

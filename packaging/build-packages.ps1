# Build Windows + macOS end-user zip packages

param(
  [switch]$SkipBuild,
  [switch]$WindowsOnly,
  [switch]$MacOnly
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)

if (-not $MacOnly) {
  Write-Host "=== Windows package ==="
  $installerArgs = @("-File", (Join-Path $Root "packaging\installer\build-installer.ps1"))
  if ($SkipBuild) { $installerArgs += "-SkipBuild" }
  & powershell -NoProfile -ExecutionPolicy Bypass @installerArgs
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

if (-not $WindowsOnly) {
  Write-Host ""
  Write-Host "=== macOS package ==="
  $macArgs = @("-File", (Join-Path $Root "packaging\build-package-mac.ps1"))
  if ($SkipBuild) { $macArgs += "-SkipBuild" }
  & powershell -NoProfile -ExecutionPolicy Bypass @macArgs
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

Write-Host ""
Write-Host "All packages ready under release\"

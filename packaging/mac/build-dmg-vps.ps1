# Upload Tournament Master.app to VPS, build TourMasterMac.dmg on Linux, download result.

param(
  [string]$Root = "",
  [string]$AppBundlePath = "",
  [string]$OutputDmg = "",
  [string]$VpsHost = "72.62.31.173",
  [string]$VpsUser = "root",
  [string]$VpsPassword = ""
)

$ErrorActionPreference = "Stop"

if (-not $Root) {
  $Root = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path))
}
if (-not $AppBundlePath) {
  $AppBundlePath = Join-Path $Root "release\Tournament Master.app"
}
if (-not $OutputDmg) {
  $OutputDmg = Join-Path $Root "release\installer\TourMasterMac.dmg"
}
if (-not $VpsPassword) {
  $VpsPassword = $env:TM_VPS_PASS
  if (-not $VpsPassword) {
    $VpsPassword = "@Pl1755551755"
  }
}

if (-not (Test-Path $AppBundlePath)) {
  throw "App bundle missing: $AppBundlePath. Run build-package-mac.ps1 first."
}

$linuxScript = Join-Path $Root "packaging\mac\build-dmg-linux.sh"
$pythonScript = Join-Path $Root "packaging\mac\build-dmg-vps.py"
if (-not (Test-Path $linuxScript)) {
  throw "Linux DMG script missing: $linuxScript"
}
if (-not (Test-Path $pythonScript)) {
  throw "VPS helper script missing: $pythonScript"
}

$linuxScriptLf = Join-Path $Root "release\.build-dmg-linux-lf.sh"
$linuxScriptText = [IO.File]::ReadAllText($linuxScript) -replace "`r`n", "`n" -replace "`r", "`n"
[IO.File]::WriteAllText($linuxScriptLf, $linuxScriptText)
$linuxScriptUpload = $linuxScriptLf

$stagingTar = Join-Path $Root "release\.mac-dmg-upload.tar.gz"
$remoteWork = "/tmp/tm-dmg-build"
$remoteApp = "$remoteWork/Tournament Master.app"
$remoteDmg = "$remoteWork/TourMasterMac.dmg"
$remoteScript = "$remoteWork/build-dmg-linux.sh"

Write-Host "==> Packaging app bundle for VPS upload"
if (Test-Path $stagingTar) {
  Remove-Item $stagingTar -Force
}

$tarAppPath = Split-Path $AppBundlePath -Parent
$tarAppName = Split-Path $AppBundlePath -Leaf
Push-Location $tarAppPath
try {
  tar -czf $stagingTar $tarAppName
} finally {
  Pop-Location
}

Write-Host "==> Connecting to VPS $VpsHost"
python $pythonScript `
  $VpsHost $VpsUser $VpsPassword `
  $stagingTar $linuxScriptUpload $OutputDmg `
  $remoteWork $remoteApp $remoteDmg $remoteScript

Remove-Item $linuxScriptLf -Force -ErrorAction SilentlyContinue

if ($LASTEXITCODE -ne 0) {
  throw "VPS DMG build failed."
}

Remove-Item $stagingTar -Force -ErrorAction SilentlyContinue
$sizeMb = [math]::Round((Get-Item $OutputDmg).Length / 1MB, 2)
Write-Host ""
Write-Host "macOS installer ready: $OutputDmg ($sizeMb MB)"

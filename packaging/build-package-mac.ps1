# Build TourMasterMac.app + TourMasterMac.zip (macOS end-user package)

param(
  [string]$StagingDir = "",
  [string]$AppBundlePath = "",
  [string]$OutputZip = "",
  [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$AppName = "Tournament Master"

if (-not $StagingDir) {
  $StagingDir = Join-Path $Root "release\TourMasterMac-staging"
}
if (-not $AppBundlePath) {
  $AppBundlePath = Join-Path $Root "release\TourMasterMac.app"
}
if (-not $OutputZip) {
  $OutputZip = Join-Path $Root "release\TourMasterMac.zip"
}

$ReleaseDir = Split-Path $OutputZip -Parent
New-Item -ItemType Directory -Path $ReleaseDir -Force | Out-Null

if (-not $SkipBuild) {
  Write-Host "Building production bundle..."
  Push-Location $Root
  npm run build
  if ($LASTEXITCODE -ne 0) { Pop-Location; exit $LASTEXITCODE }
  Pop-Location
}

Write-Host "Preparing macOS server payload at $StagingDir ..."
$stagingParent = Split-Path $StagingDir -Parent
$stagingLeaf = Split-Path $StagingDir -Leaf
$buildStagingDir = Join-Path $stagingParent "$stagingLeaf.build-tmp"

if (Test-Path $buildStagingDir) {
  Remove-Item $buildStagingDir -Recurse -Force -ErrorAction SilentlyContinue
}
New-Item -ItemType Directory -Path $buildStagingDir -Force | Out-Null

$copyItems = @(
  @{ Source = "dist"; Dest = "dist"; Recurse = $true },
  @{ Source = "migrations"; Dest = "migrations"; Recurse = $true },
  @{ Source = "packaging\start.command"; Dest = "start.command"; Recurse = $false },
  @{ Source = "packaging\local-server-package.json"; Dest = "package.json"; Recurse = $false },
  @{ Source = "packaging\README-mac.txt"; Dest = "README-mac.txt"; Recurse = $false }
)

foreach ($item in $copyItems) {
  $sourcePath = Join-Path $Root $item.Source
  $destPath = Join-Path $buildStagingDir $item.Dest
  if (-not (Test-Path $sourcePath)) {
    Write-Host "Skip missing: $($item.Source)"
    continue
  }
  if ($item.Recurse) {
    Copy-Item -Recurse $sourcePath $destPath
  } else {
    Copy-Item $sourcePath $destPath
  }
}

Write-Host ""
Write-Host "Installing production server dependencies into staging..."
Push-Location $buildStagingDir
npm install --omit=dev --no-audit --no-fund
if ($LASTEXITCODE -ne 0) {
  Pop-Location
  throw "npm install failed in staging directory."
}
Pop-Location

function Publish-StagingDirectory {
  param(
    [string]$TargetDir,
    [string]$SourceDir
  )

  New-Item -ItemType Directory -Path (Split-Path $TargetDir -Parent) -Force | Out-Null

  if (Test-Path $TargetDir) {
    try {
      Remove-Item $TargetDir -Recurse -Force -ErrorAction Stop
    } catch {
      Write-Host "WARNING: Could not replace locked folder: $TargetDir"
      return $SourceDir
    }
  }

  Rename-Item -Path $SourceDir -NewName (Split-Path $TargetDir -Leaf) -ErrorAction Stop
  return $TargetDir
}

$StagingDir = Publish-StagingDirectory -TargetDir $StagingDir -SourceDir $buildStagingDir

Write-Host ""
Write-Host "Building $AppName.app at $AppBundlePath ..."

$appBuildTmp = "$AppBundlePath.build-tmp"
if (Test-Path $appBuildTmp) {
  Remove-Item $appBuildTmp -Recurse -Force -ErrorAction SilentlyContinue
}

$macOsDir = Join-Path $appBuildTmp "Contents\MacOS"
$resourcesDir = Join-Path $appBuildTmp "Contents\Resources\server"
New-Item -ItemType Directory -Path $macOsDir -Force | Out-Null
New-Item -ItemType Directory -Path $resourcesDir -Force | Out-Null

Copy-Item -Recurse (Join-Path $StagingDir "*") $resourcesDir
Copy-Item (Join-Path $Root "packaging\mac\Info.plist") (Join-Path $appBuildTmp "Contents\Info.plist")

$launcherSrc = Join-Path $Root "packaging\mac\TournamentMaster.launcher"
$launcherDest = Join-Path $macOsDir "TournamentMaster"
Copy-Item $launcherSrc $launcherDest

# Unix line endings for macOS scripts
foreach ($scriptPath in @(
  $launcherDest,
  (Join-Path $resourcesDir "start.command")
)) {
  if (Test-Path $scriptPath) {
    $text = [IO.File]::ReadAllText($scriptPath) -replace "`r`n", "`n" -replace "`r", "`n"
    [IO.File]::WriteAllText($scriptPath, $text)
  }
}

if (Test-Path $AppBundlePath) {
  Remove-Item $AppBundlePath -Recurse -Force -ErrorAction SilentlyContinue
}
Rename-Item -Path $appBuildTmp -NewName (Split-Path $AppBundlePath -Leaf)

Write-Host "App bundle ready: $AppBundlePath"

if (Test-Path $OutputZip) {
  Remove-Item $OutputZip -Force -ErrorAction SilentlyContinue
}

Write-Host ""
Write-Host "Creating macOS zip: $OutputZip"
Compress-Archive -Path $AppBundlePath -DestinationPath $OutputZip -CompressionLevel Optimal -Force

Write-Host ""
Write-Host "Done. End-user macOS packages:"
Write-Host "  App:  $AppBundlePath"
Write-Host "  Zip:  $OutputZip"
Write-Host ""
Write-Host "On macOS:"
Write-Host "  1. Extract TourMasterMac.zip (contains Tournament Master.app)"
Write-Host "  2. Drag Tournament Master.app to Applications"
Write-Host "  3. First launch: right-click app -> Open (Gatekeeper)"
Write-Host "  4. Or run packaging/mac/build-dmg.sh on a Mac to create TourMasterMac.dmg"

# Build TourMasterMac.app + TourMasterMac.dmg (macOS end-user package)

param(
  [string]$StagingDir = "",
  [string]$AppBundlePath = "",
  [string]$OutputDmg = "",
  [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$AppName = "Tournament Master"
$ReleaseDir = Join-Path $Root "release\installer"

if (-not $StagingDir) {
  $StagingDir = Join-Path $Root "release\TourMasterMac-staging"
}
if (-not $AppBundlePath) {
  $AppBundlePath = Join-Path $Root "release\Tournament Master.app"
}
if (-not $OutputDmg) {
  $OutputDmg = Join-Path $ReleaseDir "TourMasterMac.dmg"
}

New-Item -ItemType Directory -Path $ReleaseDir -Force | Out-Null

Write-Host "Staging embedded Node.js for macOS..."
& (Join-Path $Root "packaging\scripts\stage-runtime.ps1") -DownloadNode -SkipIfPresent -Platform mac
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

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
  @{ Source = "packaging\README-mac.txt"; Dest = "README-mac.txt"; Recurse = $false },
  @{ Source = "packaging\scripts\resolve-node-mac.sh"; Dest = "scripts\resolve-node-mac.sh"; Recurse = $false }
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
    $destParent = Split-Path $destPath -Parent
    if ($destParent -and -not (Test-Path $destParent)) {
      New-Item -ItemType Directory -Path $destParent -Force | Out-Null
    }
    Copy-Item $sourcePath $destPath
  }
}

$runtimeDest = Join-Path $buildStagingDir "runtime"
New-Item -ItemType Directory -Path $runtimeDest -Force | Out-Null
foreach ($macArch in @("mac-arm64", "mac-x64")) {
  $macSrc = Join-Path $Root "packaging\runtime\$macArch"
  if (Test-Path $macSrc) {
    Copy-Item -Recurse $macSrc (Join-Path $runtimeDest $macArch)
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

Write-Host ""
Write-Host "Verifying embedded Node.js in staging..."
& (Join-Path $Root "packaging\scripts\verify-runtime-mac.ps1") -InstallDir $buildStagingDir
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

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

$iconSrc = Join-Path $Root "public\logo.png"
if (Test-Path $iconSrc) {
  Copy-Item $iconSrc (Join-Path $appBuildTmp "Contents\Resources\AppIcon.png")
}

$launcherSrc = Join-Path $Root "packaging\mac\TournamentMaster.launcher"
$launcherDest = Join-Path $macOsDir "TournamentMaster"
Copy-Item $launcherSrc $launcherDest

# Unix line endings for macOS scripts
foreach ($scriptPath in @(
  $launcherDest,
  (Join-Path $resourcesDir "start.command"),
  (Join-Path $resourcesDir "scripts\resolve-node-mac.sh")
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

Write-Host ""
Write-Host "Building macOS DMG installer via VPS..."
$dmgScript = Join-Path $Root "packaging\mac\build-dmg-vps.ps1"
& powershell -NoProfile -ExecutionPolicy Bypass -File $dmgScript -Root $Root -AppBundlePath $AppBundlePath -OutputDmg $OutputDmg
if ($LASTEXITCODE -ne 0) {
  throw "DMG build failed."
}

Write-Host ""
Write-Host "Done. End-user macOS installer:"
Write-Host "  DMG:  $OutputDmg"
Write-Host ""
Write-Host "On macOS:"
Write-Host "  1. Open TourMasterMac.dmg from release\installer"
Write-Host "  2. Drag Tournament Master.app to Applications"
Write-Host "  3. First launch: right-click app -> Open (Gatekeeper)"

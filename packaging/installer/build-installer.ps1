# Build TourMasterSetup.exe staging folder + optional Inno Setup compile (Phase 11b)

param(
  [string]$StagingDir = "",
  [switch]$SkipBuild,
  [switch]$TryInstallInno
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path))
if (-not $StagingDir) {
  $StagingDir = Join-Path $Root "release\TourMasterSetup-staging"
}
$ReleaseDir = Join-Path $Root "release\installer"
New-Item -ItemType Directory -Path $ReleaseDir -Force | Out-Null

$versionFile = Join-Path $Root "version.json"
if (-not (Test-Path -LiteralPath $versionFile)) {
  throw "version.json not found at repo root."
}
$versionInfo = Get-Content -LiteralPath $versionFile -Raw | ConvertFrom-Json
$AppVersion = [string]$versionInfo.version
if (-not $AppVersion) {
  throw "version.json is missing version."
}
Write-Host "Building Tournament Master v$AppVersion"

$localPkgPath = Join-Path $Root "packaging\local-server-package.json"
$localPkg = Get-Content -LiteralPath $localPkgPath -Raw | ConvertFrom-Json
$localPkg.version = $AppVersion
($localPkg | ConvertTo-Json -Depth 8) + [Environment]::NewLine | Set-Content -LiteralPath $localPkgPath -Encoding UTF8

Write-Host "Staging embedded Node.js for Windows..."
& (Join-Path $Root "packaging\scripts\stage-runtime.ps1") -DownloadNode -SkipIfPresent -Platform win
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

if (-not $SkipBuild) {
  Write-Host "Building production bundle..."
  Push-Location $Root
  npm run build
  if ($LASTEXITCODE -ne 0) { Pop-Location; exit $LASTEXITCODE }
  Pop-Location
}

Write-Host "Preparing installer staging at $StagingDir ..."
$stagingParent = Split-Path $StagingDir -Parent
$stagingLeaf = Split-Path $StagingDir -Leaf
$buildStagingDir = Join-Path $stagingParent "$stagingLeaf.build-tmp"

if (Test-Path $buildStagingDir) {
  Remove-Item $buildStagingDir -Recurse -Force -ErrorAction SilentlyContinue
}
New-Item -ItemType Directory -Path $buildStagingDir -Force | Out-Null
$activeStagingDir = $buildStagingDir

$copyItems = @(
  @{ Source = "dist"; Dest = "dist"; Recurse = $true },
  @{ Source = "ecosystem.config.cjs"; Dest = "ecosystem.config.cjs"; Recurse = $false },
  @{ Source = "migrations"; Dest = "migrations"; Recurse = $true },
  @{ Source = "packaging\start.bat"; Dest = "start.bat"; Recurse = $false },
  @{ Source = "packaging\stop.bat"; Dest = "stop.bat"; Recurse = $false },
  @{ Source = "packaging\restart-server.bat"; Dest = "restart-server.bat"; Recurse = $false },
  @{ Source = "packaging\backup.bat"; Dest = "backup.bat"; Recurse = $false },
  @{ Source = "packaging\TourMasterLauncher.bat"; Dest = "TourMasterLauncher.bat"; Recurse = $false },
  @{ Source = "packaging\local-server-package.json"; Dest = "package.json"; Recurse = $false },
  @{ Source = "packaging\README-win.txt"; Dest = "README-win.txt"; Recurse = $false },
  @{ Source = "packaging\scripts"; Dest = "scripts"; Recurse = $true },
  @{ Source = "packaging\launcher"; Dest = "launcher"; Recurse = $true },
  @{ Source = "version.json"; Dest = "version.json"; Recurse = $false }
)

foreach ($item in $copyItems) {
  $sourcePath = Join-Path $Root $item.Source
  $destPath = Join-Path $activeStagingDir $item.Dest
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

$runtimeDest = Join-Path $activeStagingDir "runtime"
New-Item -ItemType Directory -Path $runtimeDest -Force | Out-Null
$winNode = Join-Path $Root "packaging\runtime\node.exe"
if (Test-Path $winNode) {
  Copy-Item $winNode (Join-Path $runtimeDest "node.exe") -Force
}
foreach ($optionalDir in @("postgres", "redis")) {
  $optionalSrc = Join-Path $Root "packaging\runtime\$optionalDir"
  if (Test-Path $optionalSrc) {
    Copy-Item -Recurse $optionalSrc (Join-Path $runtimeDest $optionalDir)
  }
}

Write-Host ""
Write-Host "Installing production server dependencies into staging..."
Push-Location $activeStagingDir
npm install --omit=dev --no-audit --no-fund
if ($LASTEXITCODE -ne 0) {
  Pop-Location
  throw "npm install failed in staging directory."
}
Pop-Location

Write-Host ""
Write-Host "Preparing installer wizard assets..."
& (Join-Path $Root "packaging\installer\prepare-installer-assets.ps1") -Root $Root

$assetsDest = Join-Path $activeStagingDir "assets"
New-Item -ItemType Directory -Path $assetsDest -Force | Out-Null
$logoExeIco = Join-Path $Root "public\logoexe.ico"
if (Test-Path $logoExeIco) {
  Copy-Item $logoExeIco (Join-Path $assetsDest "logoexe.ico") -Force
  Copy-Item $logoExeIco (Join-Path $assetsDest "app-icon.ico") -Force
} else {
  Copy-Item (Join-Path $Root "packaging\installer\assets\logoexe.ico") (Join-Path $assetsDest "logoexe.ico") -Force -ErrorAction SilentlyContinue
  Copy-Item (Join-Path $Root "packaging\installer\assets\app-icon.ico") $assetsDest -Force
}

Write-Host ""
Write-Host "Verifying embedded Node.js in staging..."
& (Join-Path $Root "packaging\scripts\verify-runtime.ps1") -InstallDir $activeStagingDir -RequireNode
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
      Write-Host ""
      Write-Host "WARNING: Could not replace locked folder: $TargetDir"
      Write-Host "Using fresh build at: $SourceDir"
      return $SourceDir
    }
  }

  Rename-Item -Path $SourceDir -NewName (Split-Path $TargetDir -Leaf) -ErrorAction Stop
  return $TargetDir
}

$StagingDir = Publish-StagingDirectory -TargetDir $StagingDir -SourceDir $activeStagingDir

$winZip = Join-Path $ReleaseDir "TourMasterWin.zip"
$portableZip = Join-Path $ReleaseDir "TourMasterSetup-portable.zip"
Write-Host ""
Write-Host "Creating portable Windows zip..."
if (Test-Path $winZip) { Remove-Item $winZip -Force }
if (Test-Path $portableZip) { Remove-Item $portableZip -Force }
Compress-Archive -Path (Join-Path $StagingDir "*") -DestinationPath $winZip -CompressionLevel Optimal
Copy-Item $winZip $portableZip -Force
Write-Host "Done: release\installer\TourMasterWin.zip"

Write-Host ""
Write-Host "Staging ready: $StagingDir"

function Find-IsccPath {
  $candidates = @(
    "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe",
    "$env:ProgramFiles\Inno Setup 6\ISCC.exe",
    (Join-Path $env:LOCALAPPDATA "Programs\Inno Setup 6\ISCC.exe")
  )

  foreach ($candidate in $candidates) {
    if (Test-Path $candidate) {
      return $candidate
    }
  }

  return $null
}

$iscc = Find-IsccPath

if (-not $iscc -and $TryInstallInno) {
  Write-Host ""
  Write-Host "Inno Setup not found - attempting winget install..."
  $installed = & (Join-Path $Root "packaging\installer\install-inno-setup.ps1") -Quiet | Select-Object -Last 1
  if ($installed -and (Test-Path $installed)) {
    $iscc = $installed
  } else {
    $iscc = Find-IsccPath
  }
}

if ($iscc -and (Test-Path $iscc)) {
  Write-Host ""
  Write-Host "Compiling TourMasterSetup.exe..."
  & $iscc "/DAppVersion=$AppVersion" (Join-Path $Root "packaging\installer\TournamentMaster.iss")
  if ($LASTEXITCODE -eq 0) {
    $versionedExe = Join-Path $ReleaseDir "TourMasterSetup_$AppVersion.exe"
    $setupExe = Join-Path $ReleaseDir "TourMasterSetup.exe"
    if (Test-Path -LiteralPath $versionedExe) {
      Copy-Item -LiteralPath $versionedExe -Destination $setupExe -Force
      Write-Host "Done: release\installer\TourMasterSetup_$AppVersion.exe"
      Write-Host "Done: release\installer\TourMasterSetup.exe (latest alias)"
      & (Join-Path $Root "packaging\scripts\generate-update-manifest.ps1") -Root $Root -InstallerPath $versionedExe | Out-Null
      Write-Host "Done: release\installer\update.json"
    } else {
      Write-Host "WARNING: Expected versioned installer not found: $versionedExe"
    }
  } else {
    Write-Host "ISCC failed with exit code $LASTEXITCODE"
    exit $LASTEXITCODE
  }
} else {
  Write-Host ""
  Write-Host "Inno Setup 6 not installed - skipped .exe compile."
  Write-Host "Install: npm run install:inno"
  Write-Host "Or use portable zip for venue testing."
}

Write-Host ""
Write-Host "Test installed layout locally:"
Write-Host "  cd $StagingDir"
Write-Host "  echo installed> .installed"
Write-Host "  TourMasterLauncher.bat"

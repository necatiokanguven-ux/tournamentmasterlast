# Download portable Node.js binaries for macOS customer runtime bundle
param(
  [string]$TargetDir = "",
  [string]$NodeVersion = "20.19.0",
  [switch]$SkipIfPresent
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
if (-not $TargetDir) {
  $TargetDir = Join-Path $Root "runtime"
}

$architectures = @(
  @{ Folder = "mac-arm64"; Archive = "node-v$NodeVersion-darwin-arm64.tar.gz" },
  @{ Folder = "mac-x64"; Archive = "node-v$NodeVersion-darwin-x64.tar.gz" }
)

New-Item -ItemType Directory -Path $TargetDir -Force | Out-Null

foreach ($arch in $architectures) {
  $destDir = Join-Path $TargetDir $arch.Folder
  $nodeBin = Join-Path $destDir "node"

  if ($SkipIfPresent -and (Test-Path $nodeBin)) {
    Write-Host "Already present: $nodeBin"
    continue
  }

  $url = "https://nodejs.org/dist/v$NodeVersion/$($arch.Archive)"
  $tempArchive = Join-Path $env:TEMP $arch.Archive
  $extractDir = Join-Path $env:TEMP ($arch.Archive -replace '\.tar\.gz$','')

  Write-Host "Downloading Node.js v$NodeVersion ($($arch.Folder))..."
  Invoke-WebRequest -Uri $url -OutFile $tempArchive -UseBasicParsing

  if (Test-Path $extractDir) {
    Remove-Item $extractDir -Recurse -Force
  }

  New-Item -ItemType Directory -Path $destDir -Force | Out-Null

  $folderName = $arch.Archive -replace '\.tar\.gz$',''
  $memberPath = "$folderName/bin/node"
  tar -xzf $tempArchive -C $destDir $memberPath --strip-components=2 2>$null
  if (-not (Test-Path $nodeBin)) {
    tar -xzf $tempArchive -C $env:TEMP 2>$null
    $sourceNode = Join-Path $extractDir "bin\node"
    if (-not (Test-Path $sourceNode)) {
      Write-Host "ERROR: node binary not found in $($arch.Archive)."
      exit 1
    }
    Copy-Item $sourceNode $nodeBin -Force
  }
  Remove-Item $tempArchive -Force -ErrorAction SilentlyContinue
  Remove-Item $extractDir -Recurse -Force -ErrorAction SilentlyContinue

  Write-Host "Installed: $nodeBin"
}

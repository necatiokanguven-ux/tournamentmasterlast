# Download portable Node.js for customer runtime bundle (F11b)
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

New-Item -ItemType Directory -Path $TargetDir -Force | Out-Null
$NodeExe = Join-Path $TargetDir "node.exe"

if ($SkipIfPresent -and (Test-Path $NodeExe)) {
  Write-Host "node.exe already present at $NodeExe"
  exit 0
}

$zipName = "node-v$NodeVersion-win-x64.zip"
$url = "https://nodejs.org/dist/v$NodeVersion/$zipName"
$tempZip = Join-Path $env:TEMP $zipName
$extractDir = Join-Path $env:TEMP "node-v$NodeVersion-win-x64"

Write-Host "Downloading Node.js v$NodeVersion..."
Invoke-WebRequest -Uri $url -OutFile $tempZip -UseBasicParsing

if (Test-Path $extractDir) {
  Remove-Item $extractDir -Recurse -Force
}

Expand-Archive -Path $tempZip -DestinationPath $env:TEMP -Force
$sourceNode = Join-Path $extractDir "node.exe"
if (-not (Test-Path $sourceNode)) {
  Write-Host "ERROR: node.exe not found in archive."
  exit 1
}

Copy-Item $sourceNode $NodeExe -Force
Remove-Item $tempZip -Force -ErrorAction SilentlyContinue

Write-Host "Installed: $NodeExe"
& $NodeExe --version

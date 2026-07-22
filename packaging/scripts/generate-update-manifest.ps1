param(
  [string]$Root = "",
  [string]$OutputPath = "",
  [string]$InstallerPath = "",
  [string]$BaseDownloadUrl = "https://pokerclup.com/downloads"
)

$ErrorActionPreference = "Stop"

if (-not $Root) {
  $Root = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path))
}

$versionFile = Join-Path $Root "version.json"
if (-not (Test-Path -LiteralPath $versionFile)) {
  throw "version.json not found at $versionFile"
}

$versionInfo = Get-Content -LiteralPath $versionFile -Raw | ConvertFrom-Json
$version = [string]$versionInfo.version
if (-not $version) {
  throw "version.json is missing version"
}

if (-not $InstallerPath) {
  $InstallerPath = Join-Path $Root "release\installer\TourMasterSetup_$version.exe"
  if (-not (Test-Path -LiteralPath $InstallerPath)) {
    $InstallerPath = Join-Path $Root "release\installer\TourMasterSetup.exe"
  }
}

if (-not (Test-Path -LiteralPath $InstallerPath)) {
  throw "Installer not found: $InstallerPath"
}

$hash = (Get-FileHash -LiteralPath $InstallerPath -Algorithm SHA256).Hash.ToLower()
$sizeBytes = (Get-Item -LiteralPath $InstallerPath).Length
$fileName = Split-Path $InstallerPath -Leaf

$manifest = [ordered]@{
  version = $version
  mandatory = $false
  minSupportedVersion = "1.0.0"
  releasedAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
  platforms = [ordered]@{
    win = [ordered]@{
      url = "$BaseDownloadUrl/$fileName"
      sha256 = $hash
      sizeBytes = $sizeBytes
    }
  }
  notes = @(
    "Auto-update release $version"
  )
}

if (-not $OutputPath) {
  $OutputPath = Join-Path $Root "release\installer\update.json"
}

$manifestJson = ($manifest | ConvertTo-Json -Depth 6)
Set-Content -LiteralPath $OutputPath -Value $manifestJson -Encoding UTF8

Write-Host "Generated update manifest:"
Write-Host "  Version: $version"
Write-Host "  SHA256:  $hash"
Write-Host "  Output:  $OutputPath"

return $OutputPath

# Stage embedded Node.js runtimes into packaging/runtime (customer builds)
param(
  [switch]$DownloadNode,
  [switch]$SkipIfPresent,
  [ValidateSet("all", "win", "mac")]
  [string]$Platform = "all"
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$RuntimeDir = Join-Path $Root "runtime"
$ScriptsDir = Join-Path $Root "scripts"

New-Item -ItemType Directory -Path $RuntimeDir -Force | Out-Null

if ($DownloadNode) {
  if ($Platform -eq "all" -or $Platform -eq "win") {
    & (Join-Path $ScriptsDir "download-node-runtime.ps1") -TargetDir $RuntimeDir -SkipIfPresent:$SkipIfPresent
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  }
  if ($Platform -eq "all" -or $Platform -eq "mac") {
    & (Join-Path $ScriptsDir "download-node-runtime-mac.ps1") -TargetDir $RuntimeDir -SkipIfPresent:$SkipIfPresent
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  }
}

if ($Platform -eq "mac") {
  & (Join-Path $ScriptsDir "verify-runtime-mac.ps1") -InstallDir $Root
  exit $LASTEXITCODE
}

& (Join-Path $ScriptsDir "verify-runtime.ps1") -InstallDir $Root -RequireNode:$DownloadNode
exit $LASTEXITCODE

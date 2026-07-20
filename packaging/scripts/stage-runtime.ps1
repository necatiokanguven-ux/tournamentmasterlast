# Stage optional runtime binaries into packaging/runtime (F11b build pipeline)
param(
  [switch]$DownloadNode,
  [switch]$SkipIfPresent
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$RuntimeDir = Join-Path $Root "runtime"

New-Item -ItemType Directory -Path $RuntimeDir -Force | Out-Null

if ($DownloadNode) {
  & (Join-Path $Root "scripts\download-node-runtime.ps1") -TargetDir $RuntimeDir -SkipIfPresent:$SkipIfPresent
}

& (Join-Path $Root "scripts\verify-runtime.ps1") -InstallDir $Root -RequireNode:$DownloadNode
exit $LASTEXITCODE

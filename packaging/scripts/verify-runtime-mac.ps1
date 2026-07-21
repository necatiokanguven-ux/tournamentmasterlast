# Validate embedded macOS Node runtimes before customer .app / DMG build
param(
  [Parameter(Mandatory = $true)]
  [string]$InstallDir
)

$ErrorActionPreference = "Stop"
$InstallDir = (Resolve-Path $InstallDir).Path.TrimEnd("\")
$RuntimeRoot = Join-Path $InstallDir "runtime"

$checks = @(
  @{ Name = "mac-arm64 node"; Path = Join-Path $RuntimeRoot "mac-arm64\node" },
  @{ Name = "mac-x64 node"; Path = Join-Path $RuntimeRoot "mac-x64\node" }
)

$missing = @()
$present = @()

foreach ($check in $checks) {
  if (Test-Path $check.Path) {
    $present += $check.Name
  } else {
    $missing += $check.Name
  }
}

Write-Host "macOS runtime verification ($InstallDir)"
Write-Host "  present: $(if ($present.Count) { $present -join ', ' } else { '(none)' })"

if ($missing.Count -gt 0) {
  Write-Host "  REQUIRED missing: $($missing -join ', ')"
  Write-Host ""
  Write-Host "Run: npm run stage:runtime"
  exit 1
}

Write-Host ""
Write-Host "OK - embedded Node.js ready for macOS packages."
exit 0

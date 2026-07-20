# Validate embedded runtime layout before customer zip/installer build (F11b)
param(
  [Parameter(Mandatory = $true)]
  [string]$InstallDir,

  [switch]$RequireNode
)

$ErrorActionPreference = "Stop"
$InstallDir = (Resolve-Path $InstallDir).Path.TrimEnd("\")
$RuntimeRoot = Join-Path $InstallDir "runtime"

$checks = @(
  @{
    Name     = "node.exe"
    Path     = Join-Path $RuntimeRoot "node.exe"
    Required = [bool]$RequireNode
  },
  @{
    Name     = "postgres pg_ctl"
    Path     = Join-Path $RuntimeRoot "postgres\bin\pg_ctl.exe"
    Required = $false
  },
  @{
    Name     = "postgres initdb"
    Path     = Join-Path $RuntimeRoot "postgres\bin\initdb.exe"
    Required = $false
  },
  @{
    Name     = "redis-server"
    Path     = Join-Path $RuntimeRoot "redis\redis-server.exe"
    Required = $false
  }
)

$missingRequired = @()
$missingOptional = @()
$present = @()

foreach ($check in $checks) {
  if (Test-Path $check.Path) {
    $present += $check.Name
  } elseif ($check.Required) {
    $missingRequired += $check.Name
  } else {
    $missingOptional += $check.Name
  }
}

Write-Host "Runtime verification ($InstallDir)"
Write-Host "  present:  $(if ($present.Count) { $present -join ', ' } else { '(none)' })"
Write-Host "  optional missing: $(if ($missingOptional.Count) { $missingOptional -join ', ' } else { '(none)' })"

if ($missingRequired.Count -gt 0) {
  Write-Host "  REQUIRED missing: $($missingRequired -join ', ')"
  Write-Host ""
  Write-Host "Drop binaries into runtime\ per runtime\README.txt before building customer installer."
  exit 1
}

Write-Host ""
Write-Host "OK - db.json fallback works without optional runtimes."
exit 0

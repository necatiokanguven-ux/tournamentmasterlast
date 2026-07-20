# Build a local "user package" folder for zip-style testing (Phase 11 / 11b prep)

param(
  [string]$OutputDir = ""
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
if (-not $OutputDir) {
  $OutputDir = Join-Path $Root "release\TourMasterWin-test"
}

Write-Host "Building production bundle..."
Push-Location $Root
npm run build
if ($LASTEXITCODE -ne 0) { Pop-Location; exit $LASTEXITCODE }
Pop-Location

Write-Host "Preparing package at $OutputDir ..."
if (Test-Path $OutputDir) {
  Remove-Item $OutputDir -Recurse -Force
}
New-Item -ItemType Directory -Path $OutputDir | Out-Null

Copy-Item -Recurse (Join-Path $Root "dist") (Join-Path $OutputDir "dist")
Copy-Item -Recurse (Join-Path $Root "migrations") (Join-Path $OutputDir "migrations")
Copy-Item (Join-Path $Root "packaging\start.bat") (Join-Path $OutputDir "start.bat")
Copy-Item (Join-Path $Root "packaging\backup.bat") (Join-Path $OutputDir "backup.bat")
Copy-Item (Join-Path $Root "packaging\stop.bat") (Join-Path $OutputDir "stop.bat")
Copy-Item (Join-Path $Root "packaging\restart-server.bat") (Join-Path $OutputDir "restart-server.bat")
Copy-Item (Join-Path $Root "packaging\TourMasterLauncher.bat") (Join-Path $OutputDir "TourMasterLauncher.bat")
Copy-Item -Recurse (Join-Path $Root "packaging\launcher") (Join-Path $OutputDir "launcher")
Copy-Item (Join-Path $Root "packaging\local-server-package.json") (Join-Path $OutputDir "package.json")
Copy-Item -Recurse (Join-Path $Root "packaging\scripts") (Join-Path $OutputDir "scripts")
Copy-Item -Recurse (Join-Path $Root "packaging\runtime") (Join-Path $OutputDir "runtime")
Copy-Item (Join-Path $Root "packaging\README-win.txt") (Join-Path $OutputDir "README-win.txt")

Write-Host "Installing production server dependencies..."
Push-Location $OutputDir
npm install --omit=dev --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { Pop-Location; exit $LASTEXITCODE }
Pop-Location

if (Test-Path (Join-Path $Root "db.json")) {
  Copy-Item (Join-Path $Root "db.json") (Join-Path $OutputDir "db.json")
}

Write-Host ""
Write-Host "Done. Test like a user:"
Write-Host "  cd `"$OutputDir`""
Write-Host "  start.bat"
Write-Host ""

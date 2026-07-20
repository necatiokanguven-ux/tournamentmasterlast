param(
  [Parameter(Mandatory = $true)]
  [string]$InstallDir,

  [int]$PgPort = 5433
)

$ErrorActionPreference = "Stop"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $scriptDir "InstallDirUtils.ps1")
$InstallDir = Normalize-TournamentInstallDir -RawPath $InstallDir
$PgRoot = Join-Path $InstallDir "runtime\postgres"
$PgCtl = Join-Path $PgRoot "bin\pg_ctl.exe"

if (-not (Test-Path $PgCtl)) {
  Write-Output "SKIP"
  exit 0
}

$DataRoot = & (Join-Path $InstallDir "scripts\resolve-data-dir.ps1") -InstallDir $InstallDir
$PgData = Join-Path $DataRoot "pgdata"

if (-not (Test-Path (Join-Path $PgData "PG_VERSION"))) {
  & (Join-Path $InstallDir "scripts\init-embedded-pg.ps1") -InstallDir $InstallDir -PgPort $PgPort
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

$listener = Get-NetTCPConnection -LocalPort $PgPort -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($listener) {
  Write-Output "RUNNING"
  exit 0
}

Write-Host "Starting embedded PostgreSQL on port $PgPort..."
& $PgCtl start -D $PgData -w -o "-p $PgPort"
if ($LASTEXITCODE -ne 0) {
  Write-Host "ERROR: Could not start embedded PostgreSQL."
  exit 1
}

Write-Output "STARTED"
exit 0

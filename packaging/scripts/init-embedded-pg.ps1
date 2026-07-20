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
$InitDb = Join-Path $PgRoot "bin\initdb.exe"
$Psql = Join-Path $PgRoot "bin\psql.exe"

if (-not (Test-Path $InitDb)) {
  Write-Host "Embedded PostgreSQL not found at runtime\postgres — skipping init."
  exit 0
}

$DataRoot = & (Join-Path $InstallDir "scripts\resolve-data-dir.ps1") -InstallDir $InstallDir
$PgData = Join-Path $DataRoot "pgdata"
$ConfigPath = if ($env:TM_DATABASE_CONFIG) { $env:TM_DATABASE_CONFIG } else { Join-Path $DataRoot "config\database.json" }

New-Item -ItemType Directory -Path $PgData -Force | Out-Null
New-Item -ItemType Directory -Path (Split-Path $ConfigPath -Parent) -Force | Out-Null

if (Test-Path (Join-Path $PgData "PG_VERSION")) {
  Write-Host "PostgreSQL data directory already initialized."
  exit 0
}

Write-Host "Initializing embedded PostgreSQL (first run)..."

& $InitDb -D $PgData -U postgres -E UTF8 --locale=C --auth-local=trust --auth-host=scram-sha-256
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$bytes = New-Object byte[] 24
[System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
$appPassword = [Convert]::ToBase64String($bytes) -replace '[+/=]', 'x'

$pgHba = Join-Path $PgData "pg_hba.conf"
$hbaLines = @(
  "# Tournament Master — localhost only (Phase 2.8.4)",
  "local   all             all                                     trust",
  "host    all             all             127.0.0.1/32            scram-sha-256",
  "host    all             all             ::1/128                 scram-sha-256"
)
Set-Content -Path $pgHba -Value ($hbaLines -join "`n") -Encoding UTF8

$pgConf = Join-Path $PgData "postgresql.conf"
Add-Content -Path $pgConf -Value "`nport = $PgPort`nlisten_addresses = '127.0.0.1'`n"

$PgCtl = Join-Path $PgRoot "bin\pg_ctl.exe"
& $PgCtl start -D $PgData -w -o "-p $PgPort"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$sql = @"
CREATE USER tournament_app WITH PASSWORD '$appPassword';
CREATE DATABASE tournament_master OWNER tournament_app;
GRANT ALL PRIVILEGES ON DATABASE tournament_master TO tournament_app;
"@

& $Psql -h 127.0.0.1 -p $PgPort -U postgres -d postgres -v ON_ERROR_STOP=1 -c $sql
if ($LASTEXITCODE -ne 0) {
  & $PgCtl stop -D $PgData -m fast
  exit $LASTEXITCODE
}

$config = @{
  host     = "127.0.0.1"
  port     = $PgPort
  database = "tournament_master"
  user     = "tournament_app"
  password = $appPassword
  ssl      = $false
} | ConvertTo-Json

Set-Content -Path $ConfigPath -Value $config -Encoding UTF8
Write-Host "Wrote database config: $ConfigPath"

& $PgCtl stop -D $PgData -m fast
Write-Host "Embedded PostgreSQL initialized."
exit 0

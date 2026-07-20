param(
  [Parameter(Mandatory = $true)]
  [string]$InstallDir
)

$ErrorActionPreference = "Stop"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $scriptDir "InstallDirUtils.ps1")
$InstallDir = Normalize-TournamentInstallDir -RawPath $InstallDir
$DataRoot = & (Join-Path $scriptDir "resolve-data-dir.ps1") -InstallDir $InstallDir
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupRoot = Join-Path $DataRoot "backups"
New-Item -ItemType Directory -Path $backupRoot -Force | Out-Null

$dbPath = Join-Path $DataRoot "db.json"
if (Test-Path $dbPath) {
  $target = Join-Path $backupRoot "db-$timestamp.json"
  Copy-Item $dbPath $target
  Write-Host "Backed up db.json -> $target"
} else {
  Write-Host "No db.json at $dbPath (PostgreSQL mode may be active)."
}

$activityPath = Join-Path $DataRoot "activity.log"
if (Test-Path $activityPath) {
  $target = Join-Path $backupRoot "activity-$timestamp.log"
  Copy-Item $activityPath $target
  Write-Host "Backed up activity.log -> $target"
}

$logsDir = Join-Path $DataRoot "logs"
if (Test-Path $logsDir) {
  $logArchive = Join-Path $backupRoot "logs-$timestamp"
  Copy-Item $logsDir $logArchive -Recurse
  Write-Host "Backed up logs -> $logArchive"
}

$configPath = Join-Path $DataRoot "config\database.json"
if (Test-Path $configPath) {
  $configBackupDir = Join-Path $backupRoot "config-$timestamp"
  New-Item -ItemType Directory -Path $configBackupDir -Force | Out-Null
  Copy-Item $configPath (Join-Path $configBackupDir "database.json")
  Write-Host "Backed up database.json -> $configBackupDir"
}

$embeddedPgDump = Join-Path $InstallDir "runtime\postgres\bin\pg_dump.exe"
if (Test-Path $embeddedPgDump) {
  $pgDump = $embeddedPgDump
} else {
  $pgDumpCmd = Get-Command pg_dump -ErrorAction SilentlyContinue
  $pgDump = if ($pgDumpCmd) { $pgDumpCmd.Source } else { $null }
}

$config = $null
if (Test-Path $configPath) {
  try {
    $config = Get-Content $configPath -Raw | ConvertFrom-Json
  } catch {
    Write-Host "Could not parse database.json for pg_dump."
  }
}

if ($pgDump -and $config) {
  $pgTarget = Join-Path $backupRoot "postgres-$timestamp.sql"
  $env:PGPASSWORD = $config.password
  & $pgDump -h $config.host -p $config.port -U $config.user -d $config.database -f $pgTarget
  Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
  if (Test-Path $pgTarget) {
    Write-Host "Backed up PostgreSQL -> $pgTarget"
  }
} elseif ($env:DATABASE_URL -and $pgDump) {
  $pgTarget = Join-Path $backupRoot "postgres-$timestamp.sql"
  & $pgDump $env:DATABASE_URL -f $pgTarget
  if (Test-Path $pgTarget) {
    Write-Host "Backed up PostgreSQL -> $pgTarget"
  }
}

Write-Host "Backup complete. Folder: $backupRoot"

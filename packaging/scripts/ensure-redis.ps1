param(
  [Parameter(Mandatory = $true)]
  [string]$InstallDir,

  [int]$RedisPort = 6379
)

$ErrorActionPreference = "Stop"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $scriptDir "InstallDirUtils.ps1")
$InstallDir = Normalize-TournamentInstallDir -RawPath $InstallDir
$RedisServer = Join-Path $InstallDir "runtime\redis\redis-server.exe"
$RedisConf = Join-Path $InstallDir "runtime\redis\redis.conf"

if (-not (Test-Path $RedisServer)) {
  Write-Output "SKIP"
  exit 0
}

$DataRoot = & (Join-Path $InstallDir "scripts\resolve-data-dir.ps1") -InstallDir $InstallDir
$RedisData = Join-Path $DataRoot "redis"
New-Item -ItemType Directory -Path $RedisData -Force | Out-Null

if (-not (Test-Path $RedisConf)) {
  @"
port $RedisPort
bind 127.0.0.1
protected-mode yes
dir $RedisData
appendonly yes
appendfilename "appendonly.aof"
"@ | Set-Content -Path $RedisConf -Encoding UTF8
}

$listener = Get-NetTCPConnection -LocalPort $RedisPort -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($listener) {
  Write-Output "RUNNING"
  exit 0
}

Write-Host "Starting embedded Redis on port $RedisPort..."
Start-Process -FilePath $RedisServer -ArgumentList @($RedisConf) -WindowStyle Hidden
Start-Sleep -Seconds 2

$listener = Get-NetTCPConnection -LocalPort $RedisPort -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $listener) {
  Write-Host "ERROR: Embedded Redis failed to start."
  exit 1
}

Write-Output "STARTED"
exit 0

param(
  [Parameter(Mandatory = $true)]
  [string]$InstallDir,

  [int]$HttpPort = 3000
)

$ErrorActionPreference = "Stop"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $scriptDir "InstallDirUtils.ps1")
$InstallDir = Normalize-TournamentInstallDir -RawPath $InstallDir
$ServerMarker = "dist\server.cjs"

function Get-OurServerProcess([int]$Port) {
  $conn = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $conn) { return $null }

  $proc = Get-Process -Id $conn.OwningProcess -ErrorAction SilentlyContinue
  if (-not $proc) { return $null }

  try {
    $cmd = (Get-CimInstance Win32_Process -Filter "ProcessId=$($proc.Id)" -ErrorAction SilentlyContinue).CommandLine
    if ($cmd -and $cmd -like "*$ServerMarker*" -and $cmd -like "*$InstallDir*") {
      return $proc
    }
  } catch {
    return $null
  }
  return $null
}

$proc = Get-OurServerProcess -Port $HttpPort
if (-not $proc) {
  Write-Host "No Tournament Master server found on port $HttpPort."
  exit 0
}

Write-Host "Requesting graceful shutdown (PID $($proc.Id))..."
try {
  Invoke-RestMethod -Uri "http://127.0.0.1:$HttpPort/api/admin/shutdown" -Method POST -TimeoutSec 5 | Out-Null
} catch {
  Write-Host "Shutdown API unavailable — sending stop signal to process."
  Stop-Process -Id $proc.Id -ErrorAction SilentlyContinue
}

$deadline = (Get-Date).AddSeconds(15)
while ((Get-Date) -lt $deadline) {
  if (-not (Get-Process -Id $proc.Id -ErrorAction SilentlyContinue)) {
    Write-Host "Server stopped."
    exit 0
  }
  Start-Sleep -Milliseconds 500
}

Write-Host "Server did not stop in time."
exit 1

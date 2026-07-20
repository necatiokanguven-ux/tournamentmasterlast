param(
  [Parameter(Mandatory = $true)]
  [string]$InstallDir,

  [int]$PreferredPort = 3000,
  [int]$FallbackPort = 3001
)

$ErrorActionPreference = "Stop"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $scriptDir "InstallDirUtils.ps1")
$InstallDir = Normalize-TournamentInstallDir -RawPath $InstallDir
$ServerMarker = "dist\server.cjs"

function Get-ListenerOnPort([int]$Port) {
  $conn = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $conn) { return $null }

  $proc = Get-Process -Id $conn.OwningProcess -ErrorAction SilentlyContinue
  if (-not $proc) {
    return [PSCustomObject]@{ Port = $Port; ProcessId = $conn.OwningProcess; ProcessName = "Unknown"; IsOurs = $false }
  }

  $isOurs = $false
  try {
    $cmd = (Get-CimInstance Win32_Process -Filter "ProcessId=$($proc.Id)" -ErrorAction SilentlyContinue).CommandLine
    if ($cmd -and $cmd -like "*$ServerMarker*" -and $cmd -like "*$InstallDir*") {
      $isOurs = $true
    }
  } catch {
    # Best-effort process identification.
  }

  return [PSCustomObject]@{
    Port        = $Port
    ProcessId   = $proc.Id
    ProcessName = $proc.ProcessName
    IsOurs      = $isOurs
  }
}

function Test-PortForStart([int]$Port) {
  $listener = Get-ListenerOnPort -Port $Port
  if (-not $listener) {
    return [PSCustomObject]@{ Status = "free"; Port = $Port }
  }
  if ($listener.IsOurs) {
    return [PSCustomObject]@{ Status = "already_running"; Port = $Port; Listener = $listener }
  }
  return [PSCustomObject]@{ Status = "foreign"; Port = $Port; Listener = $listener }
}

function Write-PortNotice([string]$Message) {
  [Console]::Error.WriteLine($Message)
}

$preferred = Test-PortForStart -Port $PreferredPort
if ($preferred.Status -eq "already_running") {
  Write-Output $PreferredPort
  Write-Output "ALREADY_RUNNING"
  exit 3
}

if ($preferred.Status -eq "free") {
  Write-Output $PreferredPort
  exit 0
}

Write-PortNotice ""
Write-PortNotice "WARNING: Port $PreferredPort is in use by $($preferred.Listener.ProcessName) (PID $($preferred.Listener.ProcessId))."
Write-PortNotice "Trying fallback port $FallbackPort..."
Write-PortNotice ""

$fallback = Test-PortForStart -Port $FallbackPort
if ($fallback.Status -eq "already_running") {
  Write-Output $FallbackPort
  Write-Output "ALREADY_RUNNING"
  exit 3
}

if ($fallback.Status -eq "free") {
  Write-Output $FallbackPort
  exit 0
}

Write-PortNotice ""
Write-PortNotice "ERROR: Ports $PreferredPort and $FallbackPort are unavailable."
Write-PortNotice "Close the blocking program or set TM_HTTP_PORT to another free port."
Write-PortNotice ""
exit 1

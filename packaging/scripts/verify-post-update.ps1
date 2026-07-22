param(
  [Parameter(Mandatory = $true)]
  [string]$InstallDir,

  [int]$HttpPort = 3000,

  [int]$TimeoutSec = 90
)

$ErrorActionPreference = "Stop"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $scriptDir "InstallDirUtils.ps1")

$InstallDir = Normalize-TournamentInstallDir -RawPath $InstallDir
$UpdatesDir = Join-Path $InstallDir "Updates"
$StatePath = Join-Path $UpdatesDir "state.json"
$LogPath = Join-Path $UpdatesDir "update.log"

function Write-UpdateLog {
  param([string]$Message)
  $line = "{0} {1}" -f (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ"), $Message
  New-Item -ItemType Directory -Path $UpdatesDir -Force | Out-Null
  Add-Content -LiteralPath $LogPath -Value $line -Encoding UTF8
}

function Write-UpdateState {
  param([hashtable]$Patch)
  New-Item -ItemType Directory -Path $UpdatesDir -Force | Out-Null
  $state = New-Object PSObject
  if (Test-Path -LiteralPath $StatePath) {
    try {
      $state = Get-Content -LiteralPath $StatePath -Raw | ConvertFrom-Json
    } catch {
      $state = New-Object PSObject
    }
  }
  foreach ($key in $Patch.Keys) {
    $state | Add-Member -NotePropertyName $key -NotePropertyValue $Patch[$key] -Force
  }
  $state | Add-Member -NotePropertyName updatedAt -NotePropertyValue (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ") -Force
  ($state | ConvertTo-Json -Depth 6) | Set-Content -LiteralPath $StatePath -Encoding UTF8
}

if (-not (Test-Path -LiteralPath $StatePath)) {
  exit 0
}

$state = $null
try {
  $state = Get-Content -LiteralPath $StatePath -Raw | ConvertFrom-Json
} catch {
  exit 0
}

if (-not $state -or $state.phase -ne "awaiting_health") {
  exit 0
}

Write-UpdateLog "HEALTHCHECK started port=$HttpPort timeout=$TimeoutSec"

$deadline = (Get-Date).AddSeconds($TimeoutSec)
$healthy = $false

while ((Get-Date) -lt $deadline) {
  try {
    $health = Invoke-RestMethod -Uri "http://127.0.0.1:$HttpPort/api/health" -Method GET -TimeoutSec 5
    if ($health.ok -eq $true) {
      $healthy = $true
      break
    }
  } catch {
    # keep polling
  }
  Start-Sleep -Seconds 2
}

if ($healthy) {
  Write-UpdateLog "HEALTHCHECK ok=true"
  Write-UpdateState @{
    phase = "complete"
    error = $null
    errorCode = $null
  }
  exit 0
}

Write-UpdateLog "HEALTHCHECK failed rolling back"
& (Join-Path $scriptDir "rollback-update.ps1") -InstallDir $InstallDir -Reason "HEALTHCHECK_FAILED"
exit 1

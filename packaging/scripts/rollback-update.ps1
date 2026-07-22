param(
  [Parameter(Mandatory = $true)]
  [string]$InstallDir,

  [string]$Reason = "manual"
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

$state = $null
if (Test-Path -LiteralPath $StatePath) {
  try {
    $state = Get-Content -LiteralPath $StatePath -Raw | ConvertFrom-Json
  } catch {}
}

$rollbackPath = $null
if ($state -and $state.rollbackPath) {
  $rollbackPath = [string]$state.rollbackPath
}

if (-not $rollbackPath -or -not (Test-Path -LiteralPath $rollbackPath)) {
  $previousVersion = if ($state -and $state.previousVersion) { [string]$state.previousVersion } else { "unknown" }
  $candidate = Join-Path (Join-Path $UpdatesDir "rollback") $previousVersion
  $candidateZip = Join-Path $candidate "app-snapshot.zip"
  if (Test-Path -LiteralPath $candidateZip) {
    $rollbackPath = $candidateZip
  }
}

if (-not $rollbackPath -or -not (Test-Path -LiteralPath $rollbackPath)) {
  Write-UpdateLog "ROLLBACK skipped reason=$Reason no_snapshot=true"
  exit 1
}

Write-UpdateLog "ROLLBACK started reason=$Reason path=$rollbackPath"

$tempExtract = Join-Path $env:TEMP ("tm-restore-" + [Guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $tempExtract -Force | Out-Null

try {
  Expand-Archive -LiteralPath $rollbackPath -DestinationPath $tempExtract -Force

  Get-ChildItem -LiteralPath $tempExtract -Force | ForEach-Object {
    $target = Join-Path $InstallDir $_.Name
    if ($_.Name -eq "data" -or $_.Name -eq "Updates") {
      return
    }
    if (Test-Path -LiteralPath $target) {
      Remove-Item -LiteralPath $target -Recurse -Force
    }
    Copy-Item -LiteralPath $_.FullName -Destination $target -Recurse -Force
  }

  Write-UpdateState @{
    phase = "failed"
    error = "Update rolled back automatically ($Reason)."
    errorCode = "ROLLBACK_COMPLETED"
  }
  Write-UpdateLog "ROLLBACK completed reason=$Reason"
  exit 0
} catch {
  Write-UpdateLog "ROLLBACK failed reason=$Reason error=$($_.Exception.Message)"
  exit 1
} finally {
  if (Test-Path -LiteralPath $tempExtract) {
    Remove-Item -LiteralPath $tempExtract -Recurse -Force -ErrorAction SilentlyContinue
  }
}

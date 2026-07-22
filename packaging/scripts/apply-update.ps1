param(
  [Parameter(Mandatory = $true)]
  [string]$InstallDir,

  [Parameter(Mandatory = $true)]
  [string]$InstallerPath,

  [Parameter(Mandatory = $true)]
  [string]$ExpectedHash,

  [Parameter(Mandatory = $true)]
  [string]$TargetVersion,

  [int]$HttpPort = 3000
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

function Stop-TournamentMasterProcesses {
  param([string]$Dir, [int]$Port)

  $nodeExe = Join-Path $Dir "runtime\node.exe"
  if (-not (Test-Path -LiteralPath $nodeExe)) {
    $nodeExe = "node"
  }

  $pm2Bin = Join-Path $Dir "node_modules\pm2\bin\pm2"
  if (Test-Path -LiteralPath $pm2Bin) {
    Write-UpdateLog "SHUTDOWN stopping PM2 processes"
    & $nodeExe $pm2Bin stop tournament-master 2>$null | Out-Null
    & $nodeExe $pm2Bin stop tournament-master-watchdog 2>$null | Out-Null
    Start-Sleep -Seconds 1
    & $nodeExe $pm2Bin delete tournament-master 2>$null | Out-Null
    & $nodeExe $pm2Bin delete tournament-master-watchdog 2>$null | Out-Null
    Start-Sleep -Seconds 2
  }

  $gracefulStop = Join-Path $Dir "scripts\graceful-stop.ps1"
  if (Test-Path -LiteralPath $gracefulStop) {
    Write-UpdateLog "SHUTDOWN requesting graceful stop on port $Port"
    & $gracefulStop -InstallDir $Dir -HttpPort $Port
  }

  $deadline = (Get-Date).AddSeconds(45)
  while ((Get-Date) -lt $deadline) {
    $busy = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    if (-not $busy) {
      Write-UpdateLog "SHUTDOWN port $Port is free"
      return
    }
    Start-Sleep -Milliseconds 500
  }

  Write-UpdateLog "SHUTDOWN forcing processes on port $Port"
  foreach ($conn in Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue) {
    Stop-Process -Id $conn.OwningProcess -Force -ErrorAction SilentlyContinue
  }
}

function New-RollbackSnapshot {
  param([string]$Dir, [string]$Version)

  $rollbackRoot = Join-Path $UpdatesDir "rollback"
  $versionDir = Join-Path $rollbackRoot $Version
  New-Item -ItemType Directory -Path $versionDir -Force | Out-Null
  $zipPath = Join-Path $versionDir "app-snapshot.zip"

  $pathsToBackup = @(
    "dist",
    "scripts",
    "launcher",
    "assets",
    "ecosystem.config.cjs",
    "start.bat",
    "stop.bat",
    "restart-server.bat",
    "backup.bat",
    "TourMasterLauncher.bat",
    "version.json",
    "package.json"
  )

  $tempDir = Join-Path $env:TEMP ("tm-rollback-" + [Guid]::NewGuid().ToString("N"))
  New-Item -ItemType Directory -Path $tempDir -Force | Out-Null

  try {
    foreach ($relative in $pathsToBackup) {
      $source = Join-Path $Dir $relative
      if (-not (Test-Path -LiteralPath $source)) { continue }
      $dest = Join-Path $tempDir $relative
      $destParent = Split-Path $dest -Parent
      if ($destParent -and -not (Test-Path -LiteralPath $destParent)) {
        New-Item -ItemType Directory -Path $destParent -Force | Out-Null
      }
      Copy-Item -LiteralPath $source -Destination $dest -Recurse -Force
    }

    if (Test-Path -LiteralPath $zipPath) {
      Remove-Item -LiteralPath $zipPath -Force
    }
    Compress-Archive -Path (Join-Path $tempDir "*") -DestinationPath $zipPath -CompressionLevel Optimal
    Write-UpdateLog "BACKUP rollback=$Version path=$zipPath"
    return $zipPath
  } finally {
    if (Test-Path -LiteralPath $tempDir) {
      Remove-Item -LiteralPath $tempDir -Recurse -Force -ErrorAction SilentlyContinue
    }
  }
}

function Start-TournamentMasterAfterUpdate {
  param([string]$Dir, [int]$Port)

  $launcher = Join-Path $Dir "TourMasterLauncher.bat"
  if (Test-Path -LiteralPath $launcher) {
    Write-UpdateLog "RESTART launching TourMasterLauncher.bat"
    Start-Process -FilePath "cmd.exe" -ArgumentList "/c", "`"$launcher`"" -WorkingDirectory $Dir -WindowStyle Normal
  } else {
    $startBat = Join-Path $Dir "start.bat"
    if (Test-Path -LiteralPath $startBat) {
      Write-UpdateLog "RESTART launching start.bat"
      Start-Process -FilePath "cmd.exe" -ArgumentList "/c", "`"$startBat`"" -WorkingDirectory $Dir -WindowStyle Normal
    }
  }

  Start-Sleep -Seconds 8
  $browserScript = Join-Path $Dir "scripts\open-director-browser.ps1"
  if (Test-Path -LiteralPath $browserScript) {
    Write-UpdateLog "RESTART opening browser on port $Port"
    & $browserScript -Url "http://localhost:$Port/" -ErrorAction SilentlyContinue
  }
}

try {
  if (-not (Test-Path -LiteralPath $InstallerPath)) {
    throw "Installer not found: $InstallerPath"
  }

  Write-UpdateLog "APPLY started target=$TargetVersion installer=$InstallerPath"
  Write-UpdateState @{ phase = "applying"; targetVersion = $TargetVersion; installerPath = $InstallerPath }

  Stop-TournamentMasterProcesses -Dir $InstallDir -Port $HttpPort

  Unblock-File -LiteralPath $InstallerPath -ErrorAction SilentlyContinue
  if (Test-Path -LiteralPath "$InstallerPath`:Zone.Identifier") {
    Remove-Item -LiteralPath "$InstallerPath`:Zone.Identifier" -Force -ErrorAction SilentlyContinue
  }

  $actualHash = (Get-FileHash -LiteralPath $InstallerPath -Algorithm SHA256).Hash.ToLower()
  $expected = $ExpectedHash.Trim().ToLower()
  if ($actualHash -ne $expected) {
    Remove-Item -LiteralPath $InstallerPath -Force
    Write-UpdateLog "APPLY hash mismatch expected=$expected actual=$actualHash"
    Write-UpdateState @{
      phase = "failed"
      error = "Installer verification failed. The downloaded file was deleted."
      errorCode = "HASH_MISMATCH"
    }
    exit 1
  }

  $currentVersion = "unknown"
  $versionFile = Join-Path $InstallDir "version.json"
  if (Test-Path -LiteralPath $versionFile) {
    try {
      $currentVersion = (Get-Content -LiteralPath $versionFile -Raw | ConvertFrom-Json).version
    } catch {}
  }

  $rollbackPath = New-RollbackSnapshot -Dir $InstallDir -Version $currentVersion
  Write-UpdateState @{
    previousVersion = $currentVersion
    rollbackPath = $rollbackPath
  }

  Write-UpdateLog "INSTALL launching installer (UAC prompt may appear)"
  $installArgs = "/SILENT /SUPPRESSMSGBOXES /CLOSEAPPLICATIONS /NORESTART"
  $process = Start-Process -FilePath $InstallerPath -ArgumentList $installArgs -Wait -PassThru -Verb RunAs
  if (-not $process) {
    throw "Installer did not start. Administrator approval may have been cancelled."
  }

  $exitCode = $process.ExitCode
  Write-UpdateLog "INSTALL complete exit=$exitCode"

  if ($exitCode -ne 0) {
    Write-UpdateState @{
      phase = "failed"
      error = "Installer exited with code $exitCode"
      errorCode = "INSTALL_FAILED"
    }
    & (Join-Path $scriptDir "rollback-update.ps1") -InstallDir $InstallDir -Reason "INSTALL_EXIT_$exitCode"
    Start-TournamentMasterAfterUpdate -Dir $InstallDir -Port $HttpPort
    exit $exitCode
  }

  Write-UpdateState @{
    phase = "awaiting_health"
    targetVersion = $TargetVersion
  }
  Write-UpdateLog "APPLY complete awaiting_health=true"

  Start-TournamentMasterAfterUpdate -Dir $InstallDir -Port $HttpPort
  exit 0
} catch {
  Write-UpdateLog "APPLY failed error=$($_.Exception.Message)"
  Write-UpdateState @{
    phase = "failed"
    error = $_.Exception.Message
    errorCode = "APPLY_FAILED"
  }
  Start-TournamentMasterAfterUpdate -Dir $InstallDir -Port $HttpPort
  exit 1
}

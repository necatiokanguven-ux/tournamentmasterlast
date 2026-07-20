function Normalize-TournamentInstallDir {
  param(
    [Parameter(Mandatory = $true)]
    [string]$RawPath
  )

  $trimmed = $RawPath.Trim().TrimEnd('"', ' ', '\')
  if ($trimmed.EndsWith('.')) {
    $trimmed = $trimmed.TrimEnd('.').TrimEnd('\')
  }

  if (-not $trimmed) {
    throw "Install directory path is empty."
  }

  if (Test-Path -LiteralPath $trimmed) {
    return (Resolve-Path -LiteralPath $trimmed).Path.TrimEnd('\')
  }

  return $trimmed
}

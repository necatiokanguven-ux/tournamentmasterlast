# Build Inno Setup wizard images from public/logo.png
param(
  [string]$Root = ""
)

$ErrorActionPreference = "Stop"
if (-not $Root) {
  $Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
}

$logoPath = Join-Path $Root "public\logo.png"
$logoExeIcoPath = Join-Path $Root "public\logoexe.ico"
$logoExePngPath = Join-Path $Root "public\logoexe.png"
$assetsDir = Join-Path $Root "packaging\installer\assets"
New-Item -ItemType Directory -Path $assetsDir -Force | Out-Null

if (-not (Test-Path $logoPath)) {
  Write-Host "Logo not found: $logoPath"
  exit 1
}

if (-not (Test-Path $logoExeIcoPath) -and -not (Test-Path $logoExePngPath)) {
  Write-Host "Desktop icon source not found: $logoExeIcoPath or $logoExePngPath"
  exit 1
}

Add-Type -AssemblyName System.Drawing

function Save-IconFromPng {
  param(
    [string]$SourcePath,
    [string]$DestPath,
    [int]$Size = 256
  )

  $source = [System.Drawing.Image]::FromFile($SourcePath)
  try {
    $bitmap = New-Object System.Drawing.Bitmap $Size, $Size
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    try {
      $graphics.Clear([System.Drawing.Color]::Transparent)
      $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
      $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality

      $padding = [Math]::Floor($Size * 0.06)
      $maxSide = $Size - ($padding * 2)
      $scale = [Math]::Min($maxSide / $source.Width, $maxSide / $source.Height)
      $drawW = [int]($source.Width * $scale)
      $drawH = [int]($source.Height * $scale)
      $x = [int](($Size - $drawW) / 2)
      $y = [int](($Size - $drawH) / 2)
      $graphics.DrawImage($source, $x, $y, $drawW, $drawH)
    } finally {
      $graphics.Dispose()
    }

    $icon = [System.Drawing.Icon]::FromHandle($bitmap.GetHicon())
    try {
      $stream = [System.IO.File]::OpenWrite($DestPath)
      try {
        $icon.Save($stream)
      } finally {
        $stream.Close()
      }
    } finally {
      $icon.Dispose()
    }
    $bitmap.Dispose()
  } finally {
    $source.Dispose()
  }
}

function Save-BmpFromLogo {
  param(
    [string]$SourcePath,
    [string]$DestPath,
    [int]$Width,
    [int]$Height,
    [System.Drawing.Color]$Background
  )

  $source = [System.Drawing.Image]::FromFile($SourcePath)
  try {
    $bitmap = New-Object System.Drawing.Bitmap $Width, $Height
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    try {
      $graphics.Clear($Background)
      $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
      $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality

      $padding = [Math]::Floor([Math]::Min($Width, $Height) * 0.08)
      $maxW = $Width - ($padding * 2)
      $maxH = $Height - ($padding * 2)
      $scale = [Math]::Min($maxW / $source.Width, $maxH / $source.Height)
      $drawW = [int]($source.Width * $scale)
      $drawH = [int]($source.Height * $scale)
      $x = [int](($Width - $drawW) / 2)
      $y = [int](($Height - $drawH) / 2)
      $graphics.DrawImage($source, $x, $y, $drawW, $drawH)
    } finally {
      $graphics.Dispose()
    }

    $bitmap.Save($DestPath, [System.Drawing.Imaging.ImageFormat]::Bmp)
  } finally {
    $source.Dispose()
  }
}

$setupImage = Join-Path $assetsDir "setup-image.bmp"
$smallImage = Join-Path $assetsDir "wizard-small.bmp"
$appIcon = Join-Path $assetsDir "app-icon.ico"

Save-BmpFromLogo -SourcePath $logoPath -DestPath $setupImage -Width 200 -Height 386 -Background ([System.Drawing.Color]::FromArgb(255, 240, 240, 240))
Save-BmpFromLogo -SourcePath $logoPath -DestPath $smallImage -Width 55 -Height 55 -Background ([System.Drawing.Color]::White)

if (Test-Path $logoExeIcoPath) {
  Copy-Item $logoExeIcoPath $appIcon -Force
  Copy-Item $logoExeIcoPath (Join-Path $assetsDir "logoexe.ico") -Force
  Write-Host "Using desktop icon: $logoExeIcoPath"
} else {
  Save-IconFromPng -SourcePath $logoExePngPath -DestPath $appIcon -Size 256
  Write-Host "Generated desktop icon from: $logoExePngPath"
}

Write-Host "Installer assets ready:"
Write-Host "  $setupImage"
Write-Host "  $smallImage"
Write-Host "  $appIcon"

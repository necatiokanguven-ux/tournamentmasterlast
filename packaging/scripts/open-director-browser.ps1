param(
  [Parameter(Mandatory = $true)]
  [string]$Url
)

$ErrorActionPreference = "SilentlyContinue"

$baseUrl = ($Url -replace '#.*$', '').TrimEnd('/')
$freshUrl = "$baseUrl/#tm=$([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())"

function Start-PrivateBrowser([string]$ExePath, [string[]]$Arguments) {
  if (-not (Test-Path $ExePath)) { return $false }
  Start-Process -FilePath $ExePath -ArgumentList $Arguments | Out-Null
  return $true
}

$edgePaths = @(
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
  "$env:LOCALAPPDATA\Microsoft\Edge\Application\msedge.exe"
)

foreach ($edgePath in $edgePaths) {
  if (Start-PrivateBrowser $edgePath @("-inprivate", $freshUrl)) { exit 0 }
}

$chromePaths = @(
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
  "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
)

foreach ($chromePath in $chromePaths) {
  if (Start-PrivateBrowser $chromePath @("--incognito", $freshUrl)) { exit 0 }
}

Start-Process $freshUrl | Out-Null

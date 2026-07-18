@echo off
setlocal EnableDelayedExpansion
title Tournament Master Local Server
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is required. Install from https://nodejs.org/
  pause
  exit /b 1
)

set "BLOCKING_PROCESS="
set "BLOCKING_PID="

for /f "usebackq tokens=1,2 delims=|" %%a in (`powershell -NoProfile -Command "$conn = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1; if ($conn) { $proc = Get-Process -Id $conn.OwningProcess -ErrorAction SilentlyContinue; if ($proc) { Write-Output ($proc.ProcessName + '|' + $conn.OwningProcess) } else { Write-Output ('Unknown|'+ $conn.OwningProcess) } }"`) do (
  set "BLOCKING_PROCESS=%%a"
  set "BLOCKING_PID=%%b"
)

if defined BLOCKING_PROCESS (
  echo.
  echo ERROR: Port 3000 is already in use.
  echo Program using this port: !BLOCKING_PROCESS! ^(PID !BLOCKING_PID!^)
  echo Close that program, then run start.bat again.
  echo.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo Installing dependencies - first run may take a few minutes...
  call npm install --omit=dev
  if errorlevel 1 (
    echo Failed to install dependencies.
    pause
    exit /b 1
  )
)

if not exist "dist\server.cjs" (
  echo ERROR: dist\server.cjs is missing. Re-download TourMasterWin.zip from pokerclup.com/downloads
  pause
  exit /b 1
)

set NODE_ENV=production
set TM_AUTO_OPEN_BROWSER=1
echo.
echo Tournament Master is starting...
echo When ready, your browser will open http://localhost:3000 automatically.
echo Keep this window open during the tournament.
echo.

node dist/server.cjs
set EXIT_CODE=%ERRORLEVEL%

echo.
if not "%EXIT_CODE%"=="0" (
  echo Server stopped with an error. See the message above.
  echo If the problem continues, re-download TourMasterWin.zip from pokerclup.com/downloads
) else (
  echo Server stopped.
)
pause
exit /b %EXIT_CODE%

@echo off
setlocal EnableDelayedExpansion
title Tournament Master Local Server
cd /d "%~dp0"

set "INSTALL_DIR=%~dp0."
set "ERR_LOG=%TEMP%\tm-start-err.txt"

for /f "usebackq delims=" %%D in (`powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\resolve-data-dir.ps1" -InstallDir "%INSTALL_DIR%" 2^>"%ERR_LOG%"`) do set "TM_DATA_DIR=%%D"
if not defined TM_DATA_DIR (
  echo ERROR: Could not resolve data directory.
  if exist "%ERR_LOG%" type "%ERR_LOG%"
  pause
  exit /b 1
)

set "TM_DATABASE_CONFIG=%TM_DATA_DIR%\config\database.json"
set "TM_INSTALL_DIR=%~dp0"

for /f "usebackq delims=" %%N in (`powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\ensure-runtime.ps1" -InstallDir "%INSTALL_DIR%" 2^>"%ERR_LOG%"`) do set "NODE_EXE=%%N"
if not defined NODE_EXE (
  echo ERROR: Node.js not found. Install Node 18+ or use bundled runtime\node.exe.
  if exist "%ERR_LOG%" type "%ERR_LOG%"
  pause
  exit /b 1
)

set "TM_HTTP_PORT="
set "PORT_STATUS="

for /f "usebackq delims=" %%L in (`powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\ensure-port.ps1" -InstallDir "%INSTALL_DIR%" -PreferredPort 3000 -FallbackPort 3001 2^>"%ERR_LOG%"`) do (
  if not defined TM_HTTP_PORT (
    set "TM_HTTP_PORT=%%L"
  ) else (
    set "PORT_STATUS=%%L"
  )
)
set PS_EXIT=!ERRORLEVEL!

if !PS_EXIT! EQU 3 (
  echo.
  echo Tournament Master is already running on port !TM_HTTP_PORT!.
  echo Opening browser...
  echo.
  echo Opening browser in a fresh private window...
  echo.
  echo !TM_HTTP_PORT!> "%TM_DATA_DIR%\current-port.txt"
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\open-director-browser.ps1" -Url "http://localhost:!TM_HTTP_PORT!/"
  pause
  exit /b 0
)

if not !PS_EXIT! EQU 0 (
  echo ERROR: Could not determine HTTP port.
  if exist "%ERR_LOG%" type "%ERR_LOG%"
  pause
  exit /b 1
)

if not defined TM_HTTP_PORT (
  echo ERROR: Could not determine HTTP port.
  if exist "%ERR_LOG%" type "%ERR_LOG%"
  pause
  exit /b 1
)

echo !TM_HTTP_PORT!| findstr /R "^[0-9][0-9]*$" >nul
if errorlevel 1 (
  echo ERROR: Invalid HTTP port "!TM_HTTP_PORT!".
  echo Removing corrupted port file and retrying may help.
  if exist "%TM_DATA_DIR%\current-port.txt" del /f /q "%TM_DATA_DIR%\current-port.txt"
  if exist "%ERR_LOG%" type "%ERR_LOG%"
  pause
  exit /b 1
)

echo !TM_HTTP_PORT!> "%TM_DATA_DIR%\current-port.txt"

if not "!TM_HTTP_PORT!"=="3000" (
  echo.
  echo NOTE: Using port !TM_HTTP_PORT! because port 3000 is in use by another program.
  echo QR URLs will use http://YOUR-LOCAL-IP:!TM_HTTP_PORT!/track
  echo.
)

for /f "usebackq delims=" %%P in (`powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\ensure-postgres.ps1" -InstallDir "%INSTALL_DIR%" 2^>"%ERR_LOG%"`) do set "PG_STATUS=%%P"
if errorlevel 1 (
  if exist "%ERR_LOG%" type "%ERR_LOG%"
  pause
  exit /b 1
)

if /I "!PG_STATUS!"=="STARTED" (
  echo Embedded PostgreSQL started on port 5433.
  set USE_POSTGRES=true
) else if /I "!PG_STATUS!"=="RUNNING" (
  echo Embedded PostgreSQL already running.
  set USE_POSTGRES=true
) else (
  echo Using db.json persistence ^(embedded PostgreSQL not bundled^).
)

for /f "usebackq delims=" %%R in (`powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\ensure-redis.ps1" -InstallDir "%INSTALL_DIR%" 2^>"%ERR_LOG%"`) do set "REDIS_STATUS=%%R"
if errorlevel 1 (
  if exist "%ERR_LOG%" type "%ERR_LOG%"
  pause
  exit /b 1
)

if /I "!REDIS_STATUS!"=="STARTED" (
  echo Embedded Redis started on port 6379.
  set USE_REDIS=true
  set REDIS_URL=redis://127.0.0.1:6379
) else if /I "!REDIS_STATUS!"=="RUNNING" (
  echo Embedded Redis already running.
  set USE_REDIS=true
  set REDIS_URL=redis://127.0.0.1:6379
)

if not exist "node_modules\express" (
  echo Installing dependencies - first run may take a few minutes...
  call npm install --omit=dev
  if errorlevel 1 (
    echo Failed to install dependencies.
    pause
    exit /b 1
  )
)

if not exist "dist\server.cjs" (
  echo ERROR: dist\server.cjs is missing. Re-download TourMasterSetup from pokerclup.com
  pause
  exit /b 1
)

set NODE_ENV=production
set TM_AUTO_OPEN_BROWSER=1
set TM_HTTP_PORT=!TM_HTTP_PORT!

echo.
echo Tournament Master is starting on port !TM_HTTP_PORT!...
echo When ready, your browser will open http://localhost:!TM_HTTP_PORT! automatically.
echo Keep this window open during the tournament.
echo Data folder: !TM_DATA_DIR!
echo.

"%NODE_EXE%" dist/server.cjs
set EXIT_CODE=!ERRORLEVEL!

echo.
if not "!EXIT_CODE!"=="0" (
  echo Server stopped with an error. See the message above.
) else (
  echo Server stopped.
)
pause
exit /b !EXIT_CODE!

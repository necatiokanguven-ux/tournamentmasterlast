@echo off

setlocal

title Tournament Master — Stop Server

cd /d "%~dp0"

set "INSTALL_DIR=%~dp0."



for /f "usebackq delims=" %%P in (`powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\resolve-http-port.ps1" -InstallDir "%INSTALL_DIR%" 2^>nul`) do set "TM_HTTP_PORT=%%P"

if not defined TM_HTTP_PORT set "TM_HTTP_PORT=3000"



powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\graceful-stop.ps1" -InstallDir "%INSTALL_DIR%" -HttpPort %TM_HTTP_PORT%

pause


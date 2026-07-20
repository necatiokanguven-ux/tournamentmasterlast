@echo off
setlocal
title Tournament Master
cd /d "%~dp0"

set "INSTALL_DIR=%~dp0."
set "ERR_LOG=%TEMP%\tm-tray-err.txt"

if exist ".installed" (
  for /f "usebackq delims=" %%D in (`powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\resolve-data-dir.ps1" -InstallDir "%INSTALL_DIR%" 2^>"%ERR_LOG%"`) do set "TM_DATA_DIR=%%D"
  set "TM_DATABASE_CONFIG=%TM_DATA_DIR%\config\database.json"
)

powershell -NoProfile -ExecutionPolicy Bypass -STA -File "%~dp0launcher\tray-launcher.ps1" -InstallDir "%INSTALL_DIR%"
if errorlevel 1 (
  echo Tournament Master tray could not start.
  if exist "%ERR_LOG%" type "%ERR_LOG%"
  pause
)

@echo off

setlocal

title Tournament Master Backup

cd /d "%~dp0"

set "INSTALL_DIR=%~dp0."



powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\backup-data.ps1" -InstallDir "%INSTALL_DIR%"

if errorlevel 1 (

  echo Backup failed.

  pause

  exit /b 1

)



echo.

echo Backup saved under your data folder backups\

pause


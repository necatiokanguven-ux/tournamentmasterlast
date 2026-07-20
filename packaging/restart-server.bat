@echo off

setlocal

title Tournament Master — Restart Server

cd /d "%~dp0"

set "INSTALL_DIR=%~dp0."



powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\restart-server.ps1" -InstallDir "%INSTALL_DIR%"


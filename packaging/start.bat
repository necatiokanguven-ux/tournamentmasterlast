@echo off
title Tournament Master Local Server
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is required. Install from https://nodejs.org/
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo Installing dependencies...
  call npm install --omit=dev
  if errorlevel 1 (
    echo Failed to install dependencies.
    pause
    exit /b 1
  )
)

set NODE_ENV=production
echo Starting Tournament Master local server on port 3000...
echo Open https://app.pokerclup.com in your browser after the server starts.
echo.
node dist/server.cjs
pause

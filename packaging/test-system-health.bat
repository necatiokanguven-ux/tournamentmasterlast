@echo off
setlocal
cd /d "%~dp0.."

echo.
echo Tournament Master - System Health Auto Protection (local test)
echo ================================================================
echo.
echo Starting dev server on http://127.0.0.1:3000
echo After the browser opens, use the left menu:
echo   System Health Auto Protection
echo.
echo Auto Protection rules:
echo   Escalate after 30 seconds of high load
echo   Recover after 2 minutes of stable green load
echo.
echo To simulate load (optional, second terminal):
echo   npm run load-test:dealers
echo.

set AUTO_PROTECTION_ENABLED=true
start "" "http://127.0.0.1:3000/#system-health"
npm run dev

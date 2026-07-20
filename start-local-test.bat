@echo off
setlocal EnableDelayedExpansion
title Tournament Master - Local Test
cd /d "%~dp0"

echo.
echo ========================================
echo   Tournament Master - Local Test Server
echo ========================================
echo.
echo Calisma klasoru: %CD%
echo.

if not exist "package.json" (
  echo [HATA] package.json bulunamadi.
  echo Bu bat dosyasi su klasorde olmali:
  echo   C:\claude files\tournamentmasterlast\start-local-test.bat
  echo.
  pause
  exit /b 1
)

if not exist "server.ts" (
  echo [HATA] server.ts bulunamadi. Yanlis klasordesiniz.
  echo.
  pause
  exit /b 1
)

findstr /C:"\"dev\"" package.json >nul 2>&1
if errorlevel 1 (
  echo [HATA] package.json icinde "dev" scripti yok.
  echo Bu bat dosyasini tournamentmasterlast klasorune koyun.
  echo.
  pause
  exit /b 1
)

where node >nul 2>nul
if errorlevel 1 (
  echo [HATA] Node.js bulunamadi. Kurulum: https://nodejs.org/
  echo.
  pause
  exit /b 1
)

for /f "tokens=*" %%v in ('node -v') do set "NODE_VERSION=%%v"
echo Node.js: !NODE_VERSION!

echo.
echo 3000 portu kontrol ediliyor...
set "KILLED_ANY=0"
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":3000" ^| findstr "LISTENING"') do (
  if not "%%p"=="0" (
    echo   PID %%p kapatiliyor...
    taskkill /F /PID %%p >nul 2>&1
    set "KILLED_ANY=1"
  )
)

if "!KILLED_ANY!"=="1" (
  echo   Port temizlendi. 2 saniye bekleniyor...
  timeout /t 2 /nobreak >nul
) else (
  echo   Port 3000 zaten bos.
)

for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":3000" ^| findstr "LISTENING"') do (
  echo.
  echo [HATA] 3000 portu hala kullanimda ^(PID %%p^).
  echo Once o programi elle kapatip tekrar deneyin.
  echo.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo.
  echo Ilk calistirma: bagimliliklar yukleniyor...
  call npm install
  if errorlevel 1 (
    echo [HATA] npm install basarisiz.
    pause
    exit /b 1
  )
)

if not exist "node_modules\tsx" (
  echo.
  echo Eksik paketler yukleniyor ^(tsx^)...
  call npm install
  if errorlevel 1 (
    echo [HATA] npm install basarisiz.
    pause
    exit /b 1
  )
)

echo.
echo Sunucu baslatiliyor ^(gelistirme modu^)
echo.
echo   Director:  http://localhost:3000
echo   Dealer:    http://localhost:3000/dealer/setup?table=1
echo   Floor:     http://localhost:3000/floor?team=floor-1
echo   Tracking:  http://localhost:3000/track
echo.
echo Tarayici otomatik acilacak. Bu pencereyi acik birakin.
echo Durdurmak icin Ctrl+C veya pencereyi kapatin.
echo.

set TM_AUTO_OPEN_BROWSER=1
call npm run dev
set EXIT_CODE=%ERRORLEVEL%

echo.
if not "%EXIT_CODE%"=="0" (
  echo Sunucu hata ile kapandi ^(kod: %EXIT_CODE%^).
  echo Yukaridaki npm mesajini kontrol edin.
) else (
  echo Sunucu durduruldu.
)
echo.
pause
exit /b %EXIT_CODE%

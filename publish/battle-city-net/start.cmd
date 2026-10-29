@echo off
setlocal
cd /d "%~dp0"

set "PORT=%~1"
if "%PORT%"=="" set "PORT=8080"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   Node.js not found.
  echo   Install Node.js 18 or newer from https://nodejs.org/
  echo.
  pause
  exit /b 1
)

title Battle City server - port %PORT%
echo.
echo   BATTLE CITY - local server
echo   Open:  http://localhost:%PORT%/
echo   LAN:   use one of the IP addresses below on the other PC
echo   Stop:  close this window
echo.

start "" powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Milliseconds 1800; Start-Process 'http://localhost:%PORT%/'"
node server.js --port %PORT%

if errorlevel 1 (
  echo.
  echo   Server stopped.
  echo   If it stopped unexpectedly, the port may be busy:  start.cmd 9000
  echo.
  pause
)
endlocal

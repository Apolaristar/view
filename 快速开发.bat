@echo off
cd /d "%~dp0"
set "PATH=%~dp0tools\node\src\node-v22.19.0-win-x64;%PATH%"
where node >nul 2>nul
if errorlevel 1 (
  echo Node not found. Check tools\node
  pause
  exit /b 1
)
echo Starting dev: backend + frontend + window
echo Close this window to stop all services.
call npm run dev

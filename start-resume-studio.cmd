@echo off
setlocal
cd /d "%~dp0"
title Resume Studio - Local
echo Starting Resume Studio...
npm run dev:local
if errorlevel 1 (
  echo.
  echo Resume Studio failed to start. Keep this window open to read the error.
  pause
)
endlocal

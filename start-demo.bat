@echo off
title FreshMart Platform Demo
cd /d "%~dp0"
echo ============================================================
echo  FreshMart Platform demo  -  http://localhost:3100
echo  Keep this window open during the presentation.
echo  Close it to stop the demo.
echo ============================================================
if not exist ".next\BUILD_ID" (
  echo First run: building the app, about 1 minute...
  call npm run build
)
start "" cmd /c "timeout /t 5 >nul && start http://localhost:3100/login"
call npm run start -- -p 3100
pause

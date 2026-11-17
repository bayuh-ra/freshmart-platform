@echo off
title Jovannes Meat Shop Demo
cd /d "%~dp0"
echo ============================================================
echo  Jovanne's Meat Shop demo  -  http://localhost:3100
echo  Keep this window open during the presentation.
echo  Close it to stop the demo.
echo ============================================================
echo Building the latest version, about 1 minute...
call npm run build
start "" cmd /c "timeout /t 5 >nul && start http://localhost:3100/staff"
call npm run start -- -p 3100
pause

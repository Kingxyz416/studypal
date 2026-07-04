@echo off
title studypal - stop
echo.
echo  Stopping studypal...
echo.
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":8000" ^| findstr "LISTENING"') do taskkill /f /pid %%a >NUL 2>&1
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":5173" ^| findstr "LISTENING"') do taskkill /f /pid %%a >NUL 2>&1
echo  ✓ Done. All services stopped.
echo.
pause

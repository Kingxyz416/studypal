@echo off
title studypal - stop
echo.
echo  Stopping studypal...
echo.
taskkill /f /fi "windowtitle eq studypal-backend" >NUL 2>&1
taskkill /f /fi "windowtitle eq studypal-frontend" >NUL 2>&1
echo  ✓ Done. All services stopped.
echo.
pause

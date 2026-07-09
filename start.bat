@echo off
title studypal launcher
color 0a

echo.
echo  ╔══════════════════════════════════╗
echo  ║        studypal launcher         ║
echo  ╚══════════════════════════════════╝
echo.

:: Clean up old ports first
echo  [1/4] Stopping existing processes on ports 8000 and 5173...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":8000" ^| findstr "LISTENING"') do taskkill /f /pid %%a >NUL 2>&1
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":5173" ^| findstr "LISTENING"') do taskkill /f /pid %%a >NUL 2>&1
echo  ✓ Ports cleared.
:: Check if Ollama is running
tasklist /fi "imagename eq ollama.exe" 2>NUL | find /i "ollama.exe" >NUL
if errorlevel 1 (
    echo  [2/4] Starting Ollama...
    start /min "" ollama serve
    ping 127.0.0.1 -n 4 >NUL
) else (
    echo  [2/4] Ollama already running ✓
)

:: Start backend
echo  [3/4] Starting backend...
start /min "studypal-backend" cmd /k "cd /d "%~dp0backend" && python -m uvicorn main:app --host 127.0.0.1 --port 8000"
ping 127.0.0.1 -n 5 >NUL

:: Start frontend
echo  [4/4] Starting frontend...
start /min "studypal-frontend" cmd /k "cd /d "%~dp0frontend" && npm.cmd run dev"
ping 127.0.0.1 -n 6 >NUL

:: Open browser
echo.
echo  Opening studypal in browser...
start http://127.0.0.1:5173

echo.
echo  ✓ studypal is running at http://127.0.0.1:5173
echo  ✓ Backend API at http://127.0.0.1:8000
echo.
echo  Close this window anytime. The app keeps running.
echo  To stop everything, run stop.bat
echo.
pause

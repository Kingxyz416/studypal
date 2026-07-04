@echo off
title studypal launcher
color 0a

echo.
echo  ╔══════════════════════════════════╗
echo  ║        studypal launcher         ║
echo  ╚══════════════════════════════════╝
echo.

:: Check if Ollama is already running
tasklist /fi "imagename eq ollama.exe" 2>NUL | find /i "ollama.exe" >NUL
if errorlevel 1 (
    echo  [1/3] Starting Ollama...
    start /min "" ollama serve
    timeout /t 3 /nobreak >NUL
) else (
    echo  [1/3] Ollama already running ✓
)

:: Start backend
echo  [2/3] Starting backend...
start /min "studypal-backend" cmd /k "cd /d "%~dp0backend" && uvicorn main:app --port 8000"
timeout /t 4 /nobreak >NUL

:: Start frontend
echo  [3/3] Starting frontend...
start /min "studypal-frontend" cmd /k "cd /d "%~dp0frontend" && npm run dev"
timeout /t 5 /nobreak >NUL

:: Open browser
echo.
echo  Opening studypal in browser...
start http://localhost:5173

echo.
echo  ✓ studypal is running at http://localhost:5173
echo  ✓ Backend API at http://localhost:8000
echo.
echo  Close this window anytime. The app keeps running.
echo  To stop everything, run stop.bat
echo.
pause

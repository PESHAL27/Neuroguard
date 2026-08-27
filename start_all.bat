@echo off
setlocal EnableDelayedExpansion
cd /d "%~dp0"

:: Check for Administrator rights; if not admin, request UAC elevation automatically
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo [NeuroGuard] Requesting Administrator Privileges...
    powershell -Command "Start-Process cmd.exe -ArgumentList '/k cd /d \"%~dp0\" && call \"%~nx0\"' -Verb RunAs"
    exit /b
)

title NeuroGuard AI — Unified SOC Orchestrator (Administrator)
color 0B


echo ===================================================
echo   Starting NeuroGuard Complete SOC System
echo   Working Directory: c:\internalsih
echo ===================================================

echo [0/3] Terminating any old background Node/Python servers...
taskkill /F /IM node.exe >nul 2>&1
timeout /t 1 >nul

echo [1/3] Launching FastAPI Backend in new terminal...
start "NeuroGuard Backend (Port 8000)" cmd /k "cd /d c:\internalsih\backend && python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000"

timeout /t 2 >nul

echo [2/3] Launching Next.js Frontend (Port 3050)...
start "NeuroGuard Frontend (Port 3050)" cmd /k "cd /d c:\internalsih\frontend && npm run dev"

timeout /t 2 >nul

echo [3/3] Launching Packet Sniffer (Admin Recommended)...
start "NeuroGuard Packet Monitor" cmd /k "cd /d c:\internalsih\backend\detection && python network_monitor.py"

echo.
echo ===================================================
echo   Waiting 6 seconds for Next.js to initialize...
echo ===================================================
timeout /t 6 >nul

echo   Opening NeuroGuard Dashboard on Port 3050...
start http://localhost:3050/dashboard

echo.
echo If the browser opened too quickly, simply press Refresh (F5)!
echo.
pause




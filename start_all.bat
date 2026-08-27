@echo off
setlocal
cd /d "%~dp0"

:: Check for Administrator privileges
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo [NeuroGuard] Requesting Administrator Privileges...
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%~f0' -WorkingDirectory '%~dp0' -Verb RunAs"
    exit /b
)

title NeuroGuard AI — Unified SOC Orchestrator (Administrator)
color 0B

echo ===================================================
echo   Starting NeuroGuard Complete SOC System
echo   Working Directory: %~dp0
echo ===================================================

echo [0/3] Terminating any old background Node/Python servers...
taskkill /F /IM node.exe >nul 2>&1
timeout /t 1 >nul

echo [1/3] Launching FastAPI Backend (Port 8000)...
start "NeuroGuard Backend (Port 8000)" /D "%~dp0backend" cmd /k "python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000"

timeout /t 2 >nul

echo [2/3] Launching Next.js Frontend (Port 3050)...
start "NeuroGuard Frontend (Port 3050)" /D "%~dp0frontend" cmd /k "npm.cmd run dev"

timeout /t 2 >nul

echo [3/3] Launching Hardware Packet Sniffer (Admin)...
start "NeuroGuard Packet Monitor" /D "%~dp0backend\detection" cmd /k "python network_monitor.py"

echo.
echo ===================================================
echo   Waiting 5 seconds for services to initialize...
echo ===================================================
timeout /t 5 >nul

echo   Opening NeuroGuard Dashboard in browser...
start http://localhost:3050/dashboard

echo.
echo ===================================================
echo   System online! All SOC components are active.
echo ===================================================
echo.
pause

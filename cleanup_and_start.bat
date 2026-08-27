@echo off
title NeuroGuard - Clean Start Launcher
echo ===================================================
echo   NeuroGuard: Cleaning Port Conflicts (3000 & 8000)
echo ===================================================

echo [1/4] Freeing port 3000 and 8000 from old projects...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3000" ^| findstr "LISTENING"') do taskkill /F /PID %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":8000" ^| findstr "LISTENING"') do taskkill /F /PID %%a >nul 2>&1

timeout /t 1 >nul

echo [2/4] Launching FastAPI Backend (c:\internalsih\backend)...
start "NeuroGuard Backend (Port 8000)" cmd /k "cd /d c:\internalsih\backend && python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000"

timeout /t 2 >nul

echo [3/4] Launching Next.js Frontend (c:\internalsih\frontend)...
start "NeuroGuard Frontend (Port 3000)" cmd /k "cd /d c:\internalsih\frontend && npm run dev"

timeout /t 2 >nul

echo [4/4] Launching Hardware Packet Sniffer...
start "NeuroGuard Packet Monitor" cmd /k "cd /d c:\internalsih\backend\detection && python network_monitor.py"

echo.
echo ===================================================
echo   SUCCESS! NeuroGuard is now running cleanly:
echo   - Dashboard: http://localhost:3000/dashboard
echo   - Threat Center: http://localhost:3000/threats
echo   - Backend API: http://localhost:8000/docs
echo ===================================================
echo.
pause

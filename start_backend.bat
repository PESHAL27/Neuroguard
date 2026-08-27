@echo off
setlocal
cd /d "%~dp0backend"

:: Check for Administrator privileges
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo [NeuroGuard] Requesting Administrator Privileges...
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%comspec%' -ArgumentList '/k cd /d """"%~dp0backend"""" && call """"%~f0""""' -Verb RunAs"
    exit /b
)

title NeuroGuard — Backend API (Administrator)
color 0A
echo ===================================================
echo   Starting NeuroGuard Backend API (Port 8000)
echo   Working Directory: %~dp0backend
echo ===================================================
python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000
pause

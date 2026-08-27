@echo off
setlocal

:: Check for Administrator privileges; if not elevated, self-elevate automatically
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [NeuroGuard] Requesting Administrator Privileges for Windows Firewall Enforcement...
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process cmd -ArgumentList '/c \"\"%~f0\"\"' -Verb RunAs"
    exit /b
)

title NeuroGuard — Backend API (Administrator)
cd /d "%~dp0backend"
echo ===================================================
echo   Starting NeuroGuard Backend API (Port 8000 - Admin)
echo   Working Directory: %CD%
echo ===================================================
python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000
pause


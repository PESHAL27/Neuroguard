@echo off
setlocal
cd /d "%~dp0"

:: Check for Administrator privileges
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo [NeuroGuard] Requesting Administrator Privileges...
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%comspec%' -ArgumentList '/k cd /d \"%~dp0\" && call \"%~f0\"' -Verb RunAs"
    exit /b
)

title NeuroGuard — Live Threat Monitor & Attacker Blocker
color 0C
echo ===================================================
echo   NeuroGuard Live Terminal Threat & Attacker Blocker
echo   Working Directory: %~dp0
echo ===================================================
python "%~dp0scripts\live_threat_terminal.py"
pause

@echo off
setlocal
cd /d "%~dp0"

:: Check for Admin rights (needed for firewall rule manipulation)
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo [NeuroGuard] Requesting Administrator Privileges...
    powershell -Command "Start-Process cmd.exe -ArgumentList '/k cd /d \"%~dp0\" && call \"%~nx0\"' -Verb RunAs"
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

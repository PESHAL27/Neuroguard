@echo off
setlocal
cd /d "%~dp0backend\detection"

:: Check for Administrator privileges
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo [NeuroGuard] Requesting Administrator Privileges...
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%~f0' -WorkingDirectory '%~dp0backend\detection' -Verb RunAs"
    exit /b
)

title NeuroGuard - Hardware Packet Sniffer (Administrator)
color 0B
echo ===================================================
echo   Starting NeuroGuard Hardware Packet Sniffer
echo   Working Directory: %~dp0backend\detection
echo ===================================================
python network_monitor.py
pause

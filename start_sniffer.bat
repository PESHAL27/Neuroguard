@echo off
setlocal
cd /d "%~dp0backend\detection"

:: Check for Administrator rights (needed for Scapy raw socket packet sniffing)
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo [NeuroGuard] Requesting Administrator Privileges for Scapy Sniffer...
    powershell -Command "Start-Process cmd.exe -ArgumentList '/k cd /d \"%~dp0backend\detection\" && call \"%~nx0\"' -Verb RunAs"
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

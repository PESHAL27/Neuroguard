@echo off
setlocal
cd /d "%~dp0"

echo =====================================================================
echo   NeuroGuard - Npcap Wi-Fi Promiscuous Driver Downloader & Installer
echo =====================================================================
echo.
echo [*] Opening the official Npcap Wi-Fi packet capture installer...
echo.

:: Open default browser directly to official Npcap installer
powershell -Command "Start-Process 'https://npcap.com/dist/npcap-1.80.exe'"

echo.
echo =====================================================================
echo  IMPORTANT INSTRUCTIONS DURING INSTALLATION:
echo  1. Run the downloaded npcap-1.80.exe installer.
echo  2. Check the box: [x] Support raw 802.11 traffic (promiscuous mode) for Wi-Fi
echo  3. Check the box: [x] Install Npcap in WinPcap API-compatible Mode
echo  4. Click Finish.
echo =====================================================================
echo.
pause

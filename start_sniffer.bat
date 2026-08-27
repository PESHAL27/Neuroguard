@echo off
title NeuroGuard - Hardware Packet Sniffer
cd /d "c:\internalsih\backend\detection"
echo ===================================================
echo   Starting NeuroGuard Packet Sniffer
echo   Note: Requires Administrator privileges for Scapy
echo   Working Directory: %CD%
echo ===================================================
python network_monitor.py
pause

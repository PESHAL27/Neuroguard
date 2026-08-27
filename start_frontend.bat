@echo off
title NeuroGuard - Start Next.js Frontend
cd /d "c:\internalsih\frontend"
echo ===================================================
echo   Starting NeuroGuard Next.js Dashboard (Port 3050)
echo   Working Directory: %CD%
echo ===================================================
taskkill /F /IM node.exe >nul 2>&1
timeout /t 1 >nul
echo Starting NeuroGuard Next.js Dashboard on Port 3050...
npm run dev

pause


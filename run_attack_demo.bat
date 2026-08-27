@echo off
title NeuroGuard - Cyberattack Simulation Demo
cd /d "%~dp0"
echo ===================================================
echo   Launching NeuroGuard Attack Simulator
echo   Working Directory: %CD%
echo ===================================================
python scripts\simulate_attacks.py
pause

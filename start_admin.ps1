# NeuroGuard Full Stack Admin Launcher
$ScriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path

# Check elevation
$IsAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $IsAdmin) {
    Start-Process powershell.exe -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`"" -Verb RunAs
    exit
}

Set-Location $ScriptPath

Write-Host "===================================================" -ForegroundColor Cyan
Write-Host "  Starting NeuroGuard Complete SOC (Administrator)" -ForegroundColor Cyan
Write-Host "===================================================" -ForegroundColor Cyan

# Terminate old processes
Get-Process -Name "node" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue

# Launch Backend
Start-Process cmd.exe -ArgumentList "/k cd /d `"$ScriptPath\backend`" && python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000"

Start-Sleep -Seconds 2

# Launch Frontend
Start-Process cmd.exe -ArgumentList "/k cd /d `"$ScriptPath\frontend`" && npm run dev"

Start-Sleep -Seconds 2

# Launch Sniffer
Start-Process cmd.exe -ArgumentList "/k cd /d `"$ScriptPath\backend\detection`" && python network_monitor.py"

Start-Sleep -Seconds 5

# Open Dashboard
Start-Process "http://localhost:3050/dashboard"

Write-Host "NeuroGuard SOC Stack launched successfully!" -ForegroundColor Green

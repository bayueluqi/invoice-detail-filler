@echo off
REM encoding fix: removed chcp 65001
REM Invoice Checker Uninstaller Launcher v2.5.0
REM Date: 2026-06-23  Author: Lu Qi

:: Auto-elevate to admin
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo Requesting admin privileges...
    powershell -Command "Start-Process '%~f0' -Verb RunAs"
    exit /b
)

set "SCRIPT_DIR=%~dp0"
powershell -ExecutionPolicy Bypass -NoProfile -Command "$env:SCRIPT_DIR='%SCRIPT_DIR%'; $OutputEncoding=[Text.Encoding]::UTF8; [Console]::OutputEncoding=[Text.Encoding]::UTF8; Invoke-Expression (Get-Content '%~dp0uninstall.ps1' -Raw -Encoding UTF8)"
if %errorlevel% neq 0 (
    echo.
    echo Uninstall failed!
)
echo.
pause

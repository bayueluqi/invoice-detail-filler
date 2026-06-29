@echo off
REM encoding fix: removed chcp 65001 (ANSI/UTF-8 mismatch causes garbled Chinese)
REM Invoice Checker Installer Launcher v3.0.8
REM Date: 2026-06-23  Author: Lu Qi

:: Auto-elevate to admin
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo Requesting admin privileges...
    powershell -Command "Start-Process '%~f0' -Verb RunAs"
    exit /b
)

powershell -ExecutionPolicy Bypass -NoProfile -Command "$p='%~dp0install.ps1'; $b=[IO.File]::ReadAllBytes($p); if($b[0] -ne 0xEF){$nb=[byte[]](0xEF,0xBB,0xBF)+$b; [IO.File]::WriteAllBytes($p,$nb)}; & powershell -ExecutionPolicy Bypass -NoProfile -File $p"
if %errorlevel% neq 0 (
    echo.
    echo Install failed! Check install.log for details.
)
echo.
pause

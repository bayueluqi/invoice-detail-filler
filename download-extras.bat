@echo off
REM 下载离线依赖包 v2.5.0
REM 日期: 2026-06-23  制作人: 陆琦
cd /d "%~dp0"
powershell -ExecutionPolicy Bypass -File download-extras.ps1
echo.
echo Press any key to close...
pause >nul

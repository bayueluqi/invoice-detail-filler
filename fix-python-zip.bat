@echo off
REM 修复Python Zip下载 v2.5.0
REM 日期: 2026-06-23  制作人: 陆琦
cd /d "%~dp0"
powershell -ExecutionPolicy Bypass -File fix-python-zip.ps1

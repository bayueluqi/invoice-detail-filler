@echo off
REM encoding fix: removed chcp 65001
REM 开机守护启动器 v2.5.0
REM 日期: 2026-06-23  制作人: 陆琦
powershell -ExecutionPolicy Bypass -Command "& { Get-Content -Encoding UTF8 '%SvcRoot%\guardian.ps1' | Invoke-Expression }"

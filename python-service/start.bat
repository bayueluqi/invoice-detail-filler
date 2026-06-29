@echo off
REM encoding fix: removed chcp 65001
title 发票类型检查服务
cd /d "%~dp0"
echo 正在检查依赖...
pip show requests >nul 2>&1 || pip install requests
pip show PyMuPDF >nul 2>&1 || pip install PyMuPDF
echo ========================================
echo   发票类型检查服务 v3.0.8 - 调试模式
echo   日期: 2026-06-26  制作人: 陆琦
echo   端口: 52100  按Ctrl+C停止
echo   注意: 此窗口启动会显示控制台，仅用于调试
echo   生产环境请使用 "发票识别助手启动.bat" 或开机自启动
echo ========================================
python invoice_checker.py
pause

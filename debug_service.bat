@echo off
echo === Service diagnose v2.5.0 ===
echo 日期: 2026-06-23  制作人: 陆琦
echo.
echo 1. Python version:
python --version
echo.
echo 2. Check port 52100:
netstat -ano | findstr :52100
echo.
echo 3. Try start service 10s and capture all output:
cd /d "C:\Users\UTLQ\AppData\Local\InvoiceChecker\service"
echo --- start ---
python invoice_checker.py
echo --- end exit=%errorlevel% ---
timeout /t 3 >nul

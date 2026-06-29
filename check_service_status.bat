@echo off
REM === Service status check v2.5.0 ===
REM 日期: 2026-06-23  制作人: 陆琦
echo === Service status check v2.5.0 ===
echo.
echo 1. Python processes:
tasklist | findstr /i python
echo.
echo 2. Port 52100:
netstat -ano | findstr :52100
echo.
echo 3. Try to connect to /test:
powershell -Command "try { (Invoke-WebRequest 'http://127.0.0.1:52100/test' -UseBasicParsing -TimeoutSec 3).Content } catch { 'FAILED: ' + $_.Exception.Message }"
echo.
echo 4. Service log tail (last 30 lines):
if exist "C:\Users\UTLQ\AppData\Local\InvoiceChecker\service\service.log" (
  powershell -Command "Get-Content 'C:\Users\UTLQ\AppData\Local\InvoiceChecker\service\service.log' -Tail 30"
) else (
  echo [service.log not found]
)
echo.
timeout /t 5 >nul

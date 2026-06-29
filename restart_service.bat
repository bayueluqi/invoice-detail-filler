@echo off
REM encoding fix: removed chcp 65001
REM ==========================================
REM  发票检查服务 v2.5.0 一键重启脚本
REM  日期: 2026-06-23  制作人: 陆琦
REM  解决：重装 install.bat 后旧进程未重启的问题
REM ==========================================

echo.
echo  [1/3] 结束占用 52100 端口的旧 Python 进程...
for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":52100" ^| findstr "LISTENING"') do (
    echo    发现 PID %%P，正在结束...
    taskkill /F /PID %%P >nul 2>&1
)
timeout /t 2 >nul

echo.
echo  [2/3] 启动新版本服务 (v2.5.0)...
set SVC=C:\Users\UTLQ\AppData\Local\InvoiceChecker\service
if exist "%SVC%\start_silent.vbs" (
    start "" wscript.exe "%SVC%\start_silent.vbs"
    echo    启动命令已发出
) else (
    echo    错误：找不到 %SVC%\start_silent.vbs
    pause
    exit /b 1
)

echo.
echo  [3/3] 等待服务就绪...
set OK=0
for /l %%i in (1,1,10) do (
    timeout /t 2 >nul
    curl -s http://127.0.0.1:52100/test >nul 2>&1
    if not errorlevel 1 (
        set OK=1
        echo.
        echo  ? 服务已就绪！
        echo.
        echo  新版本响应：
        curl -s http://127.0.0.1:52100/test
        echo.
        echo.
        goto :end
    )
    echo    等待中... (第 %%i 次)
)

echo.
echo  ? 服务未就绪，请查看日志：
echo     %SVC%\service.log
echo.

:end
echo  按任意键关闭
pause >nul

@echo off
setlocal enabledelayedexpansion
title 发票检查助手 - 一键升级 v3.0.33

REM ==========================================
REM  发票检查助手 一键升级脚本
REM  版本: v3.0.33  日期: 2026-06-29
REM  制作人: 陆琦
REM  用途: 同事电脑已安装旧版本，运行此脚本升级
REM  包含: 扩展 v3.0.32 + Python服务 v3.0.13
REM ==========================================

set "SELF_DIR=%~dp0"
set "TARGET=%LOCALAPPDATA%\InvoiceChecker"
set "TARGET_EXT=%TARGET%\chrome-extension"
set "TARGET_SVC=%TARGET%\service"

echo.
echo  ========================================
echo   发票检查助手 v3.0.33 一键升级
echo  ========================================
echo.
echo  升级内容:
echo    - Chrome 扩展 v3.0.32 (发票识别开关/校验等)
echo    - Python 服务 v3.0.13 (AI发票号位置约束增强)
echo.
echo  目标路径: %TARGET%
echo.

REM ====== 检查旧安装 ======
if not exist "%TARGET%" (
    echo  [ERROR] 未找到已安装的发票检查助手！
    echo          请先运行 install.bat 完成首次安装。
    echo.
    pause
    exit /b 1
)

REM ====== 检查升级文件 ======
if not exist "%SELF_DIR%chrome-extension\content.js" (
    echo  [ERROR] 升级文件不完整，缺少 chrome-extension\content.js
    echo          请确认解压完整后重新运行。
    echo.
    pause
    exit /b 1
)
if not exist "%SELF_DIR%python-service\invoice_checker.py" (
    echo  [ERROR] 升级文件不完整，缺少 python-service\invoice_checker.py
    echo          请确认解压完整后重新运行。
    echo.
    pause
    exit /b 1
)

REM ====== [1/5] 停止服务 ======
echo  [1/5] 正在停止 Python 服务...
for /f "tokens=5" %%P in ('netstat -ano 2^>nul ^| findstr ":52100 "') do (
    set "PID=%%P"
    if not "!PID!"=="0" (
        echo        结束进程 PID=!PID!
        taskkill /F /PID !PID! >nul 2>&1
    )
)
REM wait for port to release
timeout /t 2 /nobreak >nul 2>&1
echo        服务已停止

REM ====== [2/5] 备份旧版本 ======
echo.
echo  [2/5] 正在备份旧版本...
set "BACKUP_DIR=%TARGET%\backup_%date:~0,4%%date:~5,2%%date:~8,2%_%time:~0,2%%time:~3,2%%time:~6,2%"
set "BACKUP_DIR=%BACKUP_DIR: =0%"
mkdir "%BACKUP_DIR%" >nul 2>&1
xcopy /E /I /Q /Y "%TARGET_EXT%" "%BACKUP_DIR%\chrome-extension\" >nul 2>&1
copy /Y "%TARGET_SVC%\invoice_checker.py" "%BACKUP_DIR%\" >nul 2>&1
echo        备份至: %BACKUP_DIR%

REM ====== [3/5] 覆盖 Chrome 扩展文件 ======
echo.
echo  [3/5] 正在更新 Chrome 扩展文件...
xcopy /E /I /Q /Y "%SELF_DIR%chrome-extension\*" "%TARGET_EXT%\" >nul 2>&1
echo        chrome-extension\ 更新完成

REM ====== [4/5] 覆盖 Python 服务文件 ======
echo.
echo  [4/5] 正在更新 Python 服务文件...
copy /Y "%SELF_DIR%python-service\invoice_checker.py" "%TARGET_SVC%\" >nul 2>&1
echo        python-service\ 更新完成

REM ====== [5/5] 启动服务 ======
echo.
echo  [5/5] 正在启动新版本服务...

REM 查找 Python（优先嵌入式 > managed > 系统安装）
set "PYTHON="
if exist "%TARGET_SVC%\python\pythonw.exe" (
    set "PYTHON=%TARGET_SVC%\python\pythonw.exe"
    goto :start_svc
)
if exist "%USERPROFILE%\.workbuddy\binaries\python\versions\3.13.12\pythonw.exe" (
    set "PYTHON=%USERPROFILE%\.workbuddy\binaries\python\versions\3.13.12\pythonw.exe"
    goto :start_svc
)
for %%v in (314 313 312 311 310 39) do (
    if exist "C:\Program Files\Python%%v\pythonw.exe" (
        set "PYTHON=C:\Program Files\Python%%v\pythonw.exe"
        goto :start_svc
    )
    if exist "C:\Python%%v\pythonw.exe" (
        set "PYTHON=C:\Python%%v\pythonw.exe"
        goto :start_svc
    )
)
REM fallback: pythonw from PATH
where pythonw >nul 2>&1
if !errorlevel!==0 (
    for /f "delims=" %%p in ('where pythonw 2^>nul') do set "PYTHON=%%p"
    goto :start_svc
)
where python >nul 2>&1
if !errorlevel!==0 (
    for /f "delims=" %%p in ('where python 2^>nul') do set "PYTHON=%%p"
    goto :start_svc
)

echo        [ERROR] 找不到 Python，请手动启动服务！
echo                运行: 发票识别助手启动.bat
goto :done

:start_svc
cd /d "%TARGET_SVC%"
start "" /b "%PYTHON%" invoice_checker.py

REM 等待服务就绪
set "OK=0"
for /l %%i in (1,1,10) do (
    timeout /t 1 /nobreak >nul 2>&1
    powershell -NoProfile -Command "try {$r=Invoke-WebRequest 'http://127.0.0.1:52100/health' -TimeoutSec 2 -UseBasicParsing;if($r.StatusCode -eq 200){exit 0}}catch{exit 1}" >nul 2>&1
    if !errorlevel!==0 (
        set "OK=1"
        goto :svc_ready
    )
)

echo        [WARN] 服务启动超时，请手动运行 "发票识别助手启动.bat"
goto :done

:svc_ready
echo        服务已就绪 (127.0.0.1:52100)

:done
echo.
echo  ========================================
echo   升级完成！
echo  ========================================
echo.
echo   请按以下步骤完成:
echo   1. 打开 Chrome 浏览器
echo   2. 地址栏输入: chrome://extensions
echo   3. 找到 "发票检查助手"
echo   4. 点击右下角刷新按钮 (圆形箭头)
echo   5. 刷新工作平台页面即可使用
echo.
echo   如果识别有问题，请检查服务状态:
echo   http://127.0.0.1:52100/health
echo.
pause

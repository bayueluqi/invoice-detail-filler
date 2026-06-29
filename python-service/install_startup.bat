@echo off
REM 安装开机自启动 v3.0.8
REM 日期: 2026-06-26  制作人: 陆琦
REM 原理: 在 Startup 文件夹创建快捷方式，指向 python-service\start_hidden.vbs
REM       开机时 Windows 自动执行该 vbs → 静默启动 Python 服务（无窗口）

setlocal enabledelayedexpansion

set "SD=%~dp0"
set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "VBS_SCRIPT=%SD%start_hidden.vbs"
set "LINK_FILE=%STARTUP%\发票检查服务 (InvoiceChecker).lnk"

echo ============================================
echo   发票检查助手 - 开机自启动安装
echo   版本: v3.0.8
echo ============================================
echo.

REM 检查 vbs 脚本是否存在
if not exist "%VBS_SCRIPT%" (
    echo [错误] 找不到启动脚本: %VBS_SCRIPT%
    echo 请确保 python-service\start_hidden.vbs 存在
    pause
    exit /b 1
)

REM 清理旧快捷方式
if exist "%LINK_FILE%" del /f /q "%LINK_FILE%" 2>nul

REM 创建快捷方式（用 VBS 创建，中文路径兼容性好）
set "VF=%TEMP%\invoice_install_shortcut.vbs"
> "%VF%" echo Set oWS = WScript.CreateObject("WScript.Shell")
>>"%VF%" echo sLinkFile = "%LINK_FILE%"
>>"%VF%" echo Set oLink = oWS.CreateShortcut(sLinkFile)
>>"%VF%" echo oLink.TargetPath = "%VBS_SCRIPT%"
>>"%VF%" echo oLink.WindowStyle = 7
>>"%VF%" echo oLink.WorkingDirectory = "%SD%"
>>"%VF%" echo oLink.Description = "发票类型检查服务 - 开机自动启动"
>>"%VF%" echo oLink.Save
cscript //nologo "%VF%" >nul 2>&1
del "%VF%" 2>nul

if exist "%LINK_FILE%" (
    echo [成功] 已添加到开机自启动！
    echo.
    echo 快捷方式: %LINK_FILE%
    echo 启动脚本: %VBS_SCRIPT%
    echo.
) else (
    echo [失败] 快捷方式创建失败，请以管理员身份运行
    pause
    exit /b 1
)

REM 同时清理旧的注册表 Run 键（如果有）
reg delete "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v "InvoiceChecker" /f 2>nul

echo 完成后，每次开机将自动静默启动发票检查服务（端口 52100）。
echo.
pause

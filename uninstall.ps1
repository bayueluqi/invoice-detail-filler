# ============================================
#   发票类型检查助手 - 卸载程序 v3.0.8
#   日期: 2026-06-26  制作人: 陆琦
#   PowerShell脚本 - 弹窗交互版
# ============================================

$ErrorActionPreference = "Continue"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Windows.Forms

if ($env:SCRIPT_DIR) { $ScriptDir = $env:SCRIPT_DIR.TrimEnd('\') } else { $ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path }
$LogFile = Join-Path $ScriptDir "uninstall.log"

@"
==========================================
  发票类型检查助手 - 卸载日志
  日期: $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")
  用户: $env:USERNAME
==========================================

"@ | Set-Content -Path $LogFile -Encoding UTF8

# 弹窗确认
$confirm = [System.Windows.Forms.MessageBox]::Show(
    "确定要卸载「发票类型检查助手」吗？`n`n将停止服务、移除开机启动、删除程序文件。`n浏览器扩展需手动移除。",
    "发票类型检查助手 - 卸载确认",
    [System.Windows.Forms.MessageBoxButtons]::OKCancel,
    [System.Windows.Forms.MessageBoxIcon]::Question)

if ($confirm -ne [System.Windows.Forms.DialogResult]::OK) {
    Write-Host "  用户取消卸载"
    Add-Log "用户取消卸载"
    exit 0
}

Write-Host ""
Write-Host "  发票类型检查助手 - 正在卸载..." -ForegroundColor Cyan
Write-Host ""

function Add-Log {
    param([string]$Message)
    Add-Content -Path $LogFile -Value "[$(Get-Date -Format 'HH:mm:ss')] $Message" -Encoding UTF8
}

$InstDir = Join-Path $env:LOCALAPPDATA "InvoiceChecker"

# 步骤1: 停止服务
Write-Host "  [1/3] 正在停止服务..." -ForegroundColor Cyan
Add-Log "[1/3] 停止服务"

Get-Process python -ErrorAction SilentlyContinue | Where-Object {
    $_.MainWindowTitle -like "*InvoiceChecker*"
} | Stop-Process -Force -ErrorAction SilentlyContinue

$connections = netstat -ano 2>$null | Select-String ":52100" | Select-String "LISTENING"
foreach ($conn in $connections) {
    $parts = $conn.ToString().Trim() -split '\s+'
    $svcPid = $parts[-1]
    if ($svcPid -match '^\d+$') {
        Stop-Process -Id ([int]$svcPid) -Force -ErrorAction SilentlyContinue
        Add-Log "  已终止进程 PID: $svcPid"
    }
}

Write-Host "  √ 服务已停止" -ForegroundColor Green
Add-Log "  服务已停止"

# 步骤2: 移除启动快捷方式
Write-Host "  [2/3] 正在移除开机启动..." -ForegroundColor Cyan
Add-Log "[2/3] 移除开机启动"

$startupDir = [Environment]::GetFolderPath("Startup")
@("InvoiceChecker.lnk", "发票检查服务 (InvoiceChecker).lnk") | ForEach-Object {
    $link = Join-Path $startupDir $_
    if (Test-Path $link) {
        Remove-Item $link -Force -ErrorAction SilentlyContinue
        Add-Log "  已移除: $_"
    }
}

Write-Host "  √ 启动项已移除" -ForegroundColor Green
Add-Log "  启动项已移除"

# 步骤3: 删除安装目录
Write-Host "  [3/3] 正在删除程序文件..." -ForegroundColor Cyan
Add-Log "[3/3] 删除程序文件"

$filesRemoved = $false
if (Test-Path $InstDir) {
    try {
        Remove-Item $InstDir -Recurse -Force -ErrorAction Stop
        $filesRemoved = $true
        Add-Log "  文件已删除"
    } catch {
        Add-Log "  部分文件被占用: $_"
    }
} else {
    $filesRemoved = $true
    Add-Log "  安装目录不存在，跳过"
}

if ($filesRemoved) {
    Write-Host "  √ 文件已删除" -ForegroundColor Green
} else {
    Write-Host "  ⚠ 部分文件被占用，重启后可手动删除:" -ForegroundColor Yellow
    Write-Host "    $InstDir" -ForegroundColor White
}

Write-Host ""

# 完成弹窗（地址可选中复制）
$form = New-Object System.Windows.Forms.Form
$form.Text = "发票类型检查助手 - 卸载完成"
$form.Size = New-Object System.Drawing.Size(420, 300)
$form.StartPosition = "CenterScreen"
$form.FormBorderStyle = "FixedDialog"
$form.MaximizeBox = $false
$form.MinimizeBox = $false
$form.TopMost = $true

$lbl1 = New-Object System.Windows.Forms.Label
$lbl1.Text = "卸载完成！"
$lbl1.Font = New-Object System.Drawing.Font("微软雅黑", 11, [System.Drawing.FontStyle]::Bold)
$lbl1.Size = New-Object System.Drawing.Size(360, 30)
$lbl1.Location = New-Object System.Drawing.Point(20, 15)
$form.Controls.Add($lbl1)

$lbl2 = New-Object System.Windows.Forms.Label
$lbl2.Text = "请手动移除浏览器扩展："
$lbl2.Font = New-Object System.Drawing.Font("微软雅黑", 9)
$lbl2.Size = New-Object System.Drawing.Size(360, 25)
$lbl2.Location = New-Object System.Drawing.Point(20, 50)
$form.Controls.Add($lbl2)

$lbl3 = New-Object System.Windows.Forms.Label
$lbl3.Text = "1. 复制下方地址，在浏览器中打开："
$lbl3.Font = New-Object System.Drawing.Font("微软雅黑", 9)
$lbl3.Size = New-Object System.Drawing.Size(360, 25)
$lbl3.Location = New-Object System.Drawing.Point(20, 80)
$form.Controls.Add($lbl3)

$txtUrl = New-Object System.Windows.Forms.TextBox
$txtUrl.Text = "edge://extensions"
$txtUrl.Font = New-Object System.Drawing.Font("Consolas", 10)
$txtUrl.Size = New-Object System.Drawing.Size(280, 28)
$txtUrl.Location = New-Object System.Drawing.Point(40, 110)
$txtUrl.ReadOnly = $true
$txtUrl.BackColor = [System.Drawing.Color]::White
$txtUrl.BorderStyle = "FixedSingle"
$form.Controls.Add($txtUrl)

$lbl4 = New-Object System.Windows.Forms.Label
$lbl4.Text = "（Chrome 用户请改为 chrome://extensions）"
$lbl4.Font = New-Object System.Drawing.Font("微软雅黑", 8)
$lbl4.ForeColor = [System.Drawing.Color]::Gray
$lbl4.Size = New-Object System.Drawing.Size(360, 22)
$lbl4.Location = New-Object System.Drawing.Point(40, 140)
$form.Controls.Add($lbl4)

$lbl5 = New-Object System.Windows.Forms.Label
$lbl5.Text = "2. 找到「发票类型检查助手」`n3. 点击「移除」"
$lbl5.Font = New-Object System.Drawing.Font("微软雅黑", 9)
$lbl5.Size = New-Object System.Drawing.Size(360, 40)
$lbl5.Location = New-Object System.Drawing.Point(20, 162)
$form.Controls.Add($lbl5)

$btnOK = New-Object System.Windows.Forms.Button
$btnOK.Text = "确定"
$btnOK.Font = New-Object System.Drawing.Font("微软雅黑", 9)
$btnOK.Size = New-Object System.Drawing.Size(90, 32)
$btnOK.Location = New-Object System.Drawing.Point(160, 225)
$btnOK.Add_Click({ $form.Close() })
$form.Controls.Add($btnOK)
$form.AcceptButton = $btnOK

[void]$form.ShowDialog()
$form.Dispose()

Add-Log "卸载完成"

# === 清理扩展管理策略 ===
@("HKCU:\SOFTWARE\Policies\Microsoft\Edge", "HKCU:\SOFTWARE\Policies\Google\Chrome") | ForEach-Object {
    try {
        if (Test-Path $_) {
            Remove-ItemProperty -Path $_ -Name "ExtensionSettings" -Force -ErrorAction SilentlyContinue
            Add-Log "  已清理策略: $_"
        }
    } catch {}
}

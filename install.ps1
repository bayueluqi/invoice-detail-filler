# ============================================
#   发票类型检查助手 - 安装程序 v3.23
#   日期: 2026-06-26  制作人: 陆琦
#   v3.23: 安装完成后在当前用户桌面创建「发票识别助手 (手动启动)」快捷方式
#          → 服务异常时用户可双击快速手动启动，无需找到安装目录
#   v3.22: 始终使用嵌入式Python 3.11.9，不再优先系统Python
#          → 解决用户重装/升级系统Python后依赖丢失导致服务崩溃的问题
#          → 兼容用户机器上任何版本的系统Python（3.9/3.14/3.x），因为完全不依赖它
#          → extras/wheels/ 里的 cp311 wheel 完美匹配嵌入式 Python 3.11.9
#   Windows 10/11, Chrome/Edge, 免安装Python
#   v3.18: 配套 v2.5.10——新增明细自动填写bug修复+AI弹窗统一发票号+购买方
#   v3.16: 修复已有Python但pip损坏时跳过安装的bug（同事2遇到）；
#          zip文件损坏检测（多次下载解压导致，同事1遇到）；
#          pip安装失败时直接阻断（不再静默继续白跑后续步骤）
#   v3.15: 新增pypdf纯Python保底（fitz不可用时仍可提取PDF文本）；
#          PyMuPDF安装失败时尝试安装VC++运行库并重试；
#          依赖验证显示详细错误信息（DLL load failed等）；
#          pip install加--only-binary=:all:防止源码编译
#   v3.14: 安装后自动验证关键依赖（fitz/requests），失败自动 force-reinstall；
#   v3.13: Fix Python detection - verify python --version actually outputs "Python X.Y"
#   v3.12: 升级 Python 服务兼容（pip install 失败回退 python -m pip + 国内镜像源）
#          + guardian.ps1 复制失败用 try/catch 包裹（不影响主流程）
#          + 启动服务用 Start-Process 完全脱离 PowerShell 父进程（修关闭弹窗带 Python 走的 bug）
#   v3.11: 启动服务前先 kill 占用 52100 的旧 Python 进程（避免重装后老版本残留）
#   v3.10: 修复开机 guardian.vbs 800A0401 编译错误（v3.9 用 $threeQ 三引号拼接，
#          VBScript 解析后路径被截断 → 改用 Chr(34) 拼接路径，100% 兼容任何 Windows 用户名）
#          v3.9: 彻底放弃自动调起浏览器方案！
#         v3.5/v3.6/v3.7/v3.8 四次踩坑：HTML引导页 / CreateProcess / ShellExecute协议处理器 / ProcessStartInfo+--single-argument
#         → 全部失败！公司电脑 edge:// 协议未注册 + msedge 接收 URL 参数行为不一致
#         v3.9 改为最稳方案：完成弹窗里直接显示可复制的 URL + 路径 + 一键复制按钮
#         → 100% 一定成功（完全不依赖任何外部机制/协议/命令行）
#   PowerShell脚本 - 全弹窗交互版
#   执行方式: powershell -File (不再用 Invoke-Expression)
# ============================================

$ErrorActionPreference = "Continue"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Windows.Forms

# === 脚本目录 ===
$ScriptDir = $PSScriptRoot
if (-not $ScriptDir) { $ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path }
$LogFile = Join-Path $ScriptDir "install.log"

# === 工具函数 ===
function Add-Log {
    param([string]$Msg)
    Add-Content -Path $LogFile -Value "[$(Get-Date -Format 'HH:mm:ss')] $Msg" -Encoding UTF8
}

function Show-Msg {
    param([string]$Text, [string]$Title = "发票类型检查助手", [int]$Icon = 0)
    $icons = @([System.Windows.Forms.MessageBoxIcon]::Information,
               [System.Windows.Forms.MessageBoxIcon]::Warning,
               [System.Windows.Forms.MessageBoxIcon]::Error,
               [System.Windows.Forms.MessageBoxIcon]::Question)
    [System.Windows.Forms.MessageBox]::Show($Text, $Title, [System.Windows.Forms.MessageBoxButtons]::OK, $icons[$Icon])
}

function Ask-YesNo {
    param([string]$Text, [string]$Title = "发票类型检查助手")
    $r = [System.Windows.Forms.MessageBox]::Show($Text, $Title,
        [System.Windows.Forms.MessageBoxButtons]::YesNo,
        [System.Windows.Forms.MessageBoxIcon]::Question)
    return ($r -eq [System.Windows.Forms.DialogResult]::Yes)
}

# 浏览器选择弹窗
function Select-Browser {
    $form = New-Object System.Windows.Forms.Form
    $form.Text = "发票类型检查助手"
    $form.Size = New-Object System.Drawing.Size(440, 280)
    $form.StartPosition = "CenterScreen"
    $form.FormBorderStyle = "FixedDialog"
    $form.MaximizeBox = $false
    $form.MinimizeBox = $false
    $form.TopMost = $true

    $lbl = New-Object System.Windows.Forms.Label
    $lbl.Text = "检测到您的电脑同时安装了 Edge 和 Chrome`n`n请选择您用来访问优通系统的浏览器："
    $lbl.Font = New-Object System.Drawing.Font("微软雅黑", 10)
    $lbl.Size = New-Object System.Drawing.Size(380, 70)
    $lbl.Location = New-Object System.Drawing.Point(25, 25)
    $form.Controls.Add($lbl)

    $btnEdge = New-Object System.Windows.Forms.Button
    $btnEdge.Text = "Edge（推荐）"
    $btnEdge.Font = New-Object System.Drawing.Font("微软雅黑", 12, [System.Drawing.FontStyle]::Bold)
    $btnEdge.Size = New-Object System.Drawing.Size(175, 60)
    $btnEdge.Location = New-Object System.Drawing.Point(25, 115)
    $btnEdge.BackColor = [System.Drawing.Color]::FromArgb(51, 103, 145)
    $btnEdge.ForeColor = [System.Drawing.Color]::White
    $btnEdge.FlatStyle = "Flat"
    $btnEdge.Add_Click({ $form.Tag = "edge"; $form.Close() })
    $form.Controls.Add($btnEdge)

    $btnChrome = New-Object System.Windows.Forms.Button
    $btnChrome.Text = "Chrome"
    $btnChrome.Font = New-Object System.Drawing.Font("微软雅黑", 12, [System.Drawing.FontStyle]::Bold)
    $btnChrome.Size = New-Object System.Drawing.Size(175, 60)
    $btnChrome.Location = New-Object System.Drawing.Point(220, 115)
    $btnChrome.BackColor = [System.Drawing.Color]::FromArgb(66, 133, 244)
    $btnChrome.ForeColor = [System.Drawing.Color]::White
    $btnChrome.FlatStyle = "Flat"
    $btnChrome.Add_Click({ $form.Tag = "chrome"; $form.Close() })
    $form.Controls.Add($btnChrome)

    $hint = New-Object System.Windows.Forms.Label
    $hint.Text = "提示：公司电脑一般自带 Edge"
    $hint.Font = New-Object System.Drawing.Font("微软雅黑", 8)
    $hint.ForeColor = [System.Drawing.Color]::Gray
    $hint.Size = New-Object System.Drawing.Size(250, 25)
    $hint.Location = New-Object System.Drawing.Point(25, 195)
    $form.Controls.Add($hint)

    $form.Tag = "edge"
    [void]$form.ShowDialog()
    $result = $form.Tag
    $form.Dispose()
    return $result
}

# 进度弹窗
function Show-Progress {
    param([string]$Title = "安装中", [string]$Message = "请稍候...")
    $script:progressForm = New-Object System.Windows.Forms.Form
    $script:progressForm.Text = "发票类型检查助手"
    $script:progressForm.Size = New-Object System.Drawing.Size(400, 180)
    $script:progressForm.StartPosition = "CenterScreen"
    $script:progressForm.FormBorderStyle = "FixedDialog"
    $script:progressForm.MaximizeBox = $false
    $script:progressForm.MinimizeBox = $false
    $script:progressForm.TopMost = $true

    $lblTitle = New-Object System.Windows.Forms.Label
    $lblTitle.Text = $Title
    $lblTitle.Font = New-Object System.Drawing.Font("微软雅黑", 12, [System.Drawing.FontStyle]::Bold)
    $lblTitle.Size = New-Object System.Drawing.Size(350, 35)
    $lblTitle.Location = New-Object System.Drawing.Point(25, 20)
    $script:progressForm.Controls.Add($lblTitle)

    $lblMsg = New-Object System.Windows.Forms.Label
    $lblMsg.Text = $Message
    $lblMsg.Font = New-Object System.Drawing.Font("微软雅黑", 9)
    $lblMsg.Size = New-Object System.Drawing.Size(350, 30)
    $lblMsg.Location = New-Object System.Drawing.Point(25, 65)
    $lblMsg.ForeColor = [System.Drawing.Color]::Gray
    $script:progressForm.Controls.Add($lblMsg)

    $bar = New-Object System.Windows.Forms.ProgressBar
    $bar.Style = "Marquee"
    $bar.MarqueeAnimationSpeed = 30
    $bar.Size = New-Object System.Drawing.Size(340, 20)
    $bar.Location = New-Object System.Drawing.Point(25, 105)
    $script:progressForm.Controls.Add($bar)

    $script:progressForm.Show()
    [System.Windows.Forms.Application]::DoEvents()
}

function Update-Progress {
    param([string]$Message)
    if ($script:progressForm -and -not $script:progressForm.IsDisposed) {
        $lbl = $script:progressForm.Controls[1]
        if ($lbl) { $lbl.Text = $Message }
        [System.Windows.Forms.Application]::DoEvents()
    }
}

function Close-Progress {
    if ($script:progressForm -and -not $script:progressForm.IsDisposed) {
        $script:progressForm.Close()
        $script:progressForm.Dispose()
    }
}

# === 加载 C# 弹窗守护类（独立文件） ===
try {
    $csFile = Join-Path $ScriptDir "DevModeDialogHelper.cs"
    Add-Type -ReferencedAssemblies System.Windows.Forms -Path $csFile
} catch {}

# === 初始化日志 ===
$logInitTime = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
$logInitLines = @(
    "==========================================",
    "  发票类型检查助手 - 安装日志 v3.23",
    "  日期: $logInitTime",
    "  用户: $env:USERNAME",
    "  系统: $env:OS",
    "  来源: $ScriptDir",
    "==========================================",
    ""
)
Set-Content -Path $LogFile -Value $logInitLines -Encoding UTF8

# === 欢迎弹窗 ===
$welcome = [System.Windows.Forms.MessageBox]::Show(
    "即将安装「发票类型检查助手」`n`n安装过程全自动，请耐心等待。`n安装完成后会自动打开浏览器，请按提示完成最后一步。`n`n是否开始安装？",
    "发票类型检查助手 - 安装向导",
    [System.Windows.Forms.MessageBoxButtons]::YesNo,
    [System.Windows.Forms.MessageBoxIcon]::Question)

if ($welcome -ne [System.Windows.Forms.DialogResult]::Yes) {
    Add-Log "用户取消安装"
    exit 0
}

Add-Log "用户确认开始安装"
Show-Progress -Title "正在安装，请稍候..." -Message "准备中..."

# === 安装目录 ===
$InstDir = Join-Path $env:LOCALAPPDATA "InvoiceChecker"
$PyDir = Join-Path $InstDir "python"
$SvcRoot = Join-Path $InstDir "service"
$ExtDir = Join-Path $InstDir "chrome-extension"

# === 步骤1: 创建目录 ===
Update-Progress "正在创建安装目录..."
Add-Log "[1/7] 创建目录"
try {
    @($InstDir, $SvcRoot, $ExtDir) | ForEach-Object {
        if (-not (Test-Path $_)) { New-Item -Path $_ -ItemType Directory -Force | Out-Null }
    }
    Add-Log "  OK"
} catch {
    Add-Log "  FAIL: $_"
    Close-Progress
    Show-Msg "无法创建安装目录，请确认有权限后重试。`n`n错误：$_" -Icon 2
    exit 1
}

# === 步骤2: 检查/安装Python ===
$PyCmd = $null

# v3.22: 始终使用嵌入式Python，不再优先系统Python
# 原因：用户重装/升级系统Python后依赖丢失导致服务崩溃(v3.0.11踩坑)
# 嵌入式Python自包含在安装目录中，不受系统Python变化影响
# 兼容用户机器上任何版本的系统Python（3.9/3.14/3.x），因为完全不依赖它

# 记录系统Python版本（仅诊断日志，不使用）
try {
    $sysPyVer = & python --version 2>&1
    if ("$sysPyVer" -match 'Python\s+\d') {
        Add-Log "[2/7] System Python detected (NOT used): $sysPyVer"
    }
} catch {}

# 检查已有的嵌入式Python
if (Test-Path "$PyDir\python.exe") {
    $pyVer = & "$PyDir\python.exe" --version 2>&1
    $PyCmd = "$PyDir\python.exe"
    Add-Log "[2/7] Embedded Python: $pyVer"
    # v3.16: Check if pip works in existing Python - if not, need re-bootstrap
    $pipCheck = & $PyCmd -m pip --version 2>&1
    if ($LASTEXITCODE -ne 0 -or "$pipCheck" -match 'No module named pip') {
        Add-Log "  pip missing in existing Python, will re-bootstrap"
        $needPipBootstrap = $true
    }
}

if (-not $PyCmd) {
    # v3.15: 优先从本地 extras/ 目录取 Python zip，没有再下载
    $localPyZip = Join-Path $ScriptDir "extras\python-3.11.9-embed-amd64.zip"
    $pyZip = Join-Path $InstDir "python-embed.zip"

    if (Test-Path $localPyZip) {
        Update-Progress "正在复制本地Python环境..."
        Add-Log "[2/7] 使用本地Python包: $localPyZip"
        Copy-Item $localPyZip -Destination $pyZip -Force
        # v3.16: Validate zip integrity (valid Python embed zip must be >= 5MB)
        $zipSize = (Get-Item $pyZip).Length / 1MB
        if ($zipSize -lt 5) {
            Close-Progress
            Show-Msg "Python包文件损坏（仅$([Math]::Round($zipSize, 1))MB，正常应约10MB）。`n`n请重新拷贝完整的安装包目录，避免多次下载解压导致文件损坏。" -Icon 2
            Add-Log "  FAIL: zip file too small ($([Math]::Round($zipSize, 1))MB), likely corrupted"
            exit 1
        }
    } else {
        Update-Progress "正在下载Python环境（约10MB）..."
        Add-Log "[2/7] 下载Python（本地无预打包）"
        try {
            [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
            Invoke-WebRequest -Uri "https://www.python.org/ftp/python/3.11.9/python-3.11.9-embed-amd64.zip" -OutFile $pyZip -UseBasicParsing
        } catch {
            Close-Progress
            Show-Msg "Python下载失败，请检查网络连接后重试。`n`n提示：可将 python-3.11.9-embed-amd64.zip 放到安装目录的 extras 子文件夹下避免下载。" -Icon 2
            Add-Log "  FAIL: $_"
            exit 1
        }
    }

    Update-Progress "正在解压Python..."
    try {
        Expand-Archive -Path $pyZip -DestinationPath $PyDir -Force
        Remove-Item $pyZip -Force -ErrorAction SilentlyContinue
    } catch {
        Close-Progress
        Show-Msg "Python解压失败。安装包可能已损坏，请重新拷贝完整目录。`n`n错误: $_" -Icon 2
        Add-Log "  FAIL: $_"
        exit 1
    }

    $pthFile = Join-Path $PyDir "python311._pth"
    if (Test-Path $pthFile) {
        $content = Get-Content $pthFile -Raw
        $content = $content -replace '#import site', 'import site'
        Set-Content $pthFile $content -NoNewline
    }

    $PyCmd = "$PyDir\python.exe"
    $needPipBootstrap = $true
}

# v3.16: Bootstrap pip (fresh install OR existing Python with broken pip)
if ($needPipBootstrap) {
    Update-Progress "正在配置Python环境..."
    # v3.15: get-pip.py 也优先本地
    $localGetPip = Join-Path $ScriptDir "extras\get-pip.py"
    $getPip = Join-Path $InstDir "get-pip.py"
    if (Test-Path $localGetPip) {
        Copy-Item $localGetPip -Destination $getPip -Force
        Add-Log "  使用本地get-pip.py"
    } else {
        try {
            [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
            Invoke-WebRequest -Uri "https://bootstrap.pypa.io/get-pip.py" -OutFile $getPip -UseBasicParsing
        } catch {
            Add-Log "  WARN pip download: $_"
        }
    }
    try {
        & "$PyDir\python.exe" $getPip --no-warn-script-location 2>&1 | ForEach-Object { Add-Log "    $_" }
    } catch {
        Add-Log "  WARN pip: $_"
    }
    Remove-Item $getPip -Force -ErrorAction SilentlyContinue
    # v3.16: Verify pip actually works after bootstrap
    $pipVerify = & $PyCmd -m pip --version 2>&1
    if ($LASTEXITCODE -ne 0 -or "$pipVerify" -match 'No module named pip') {
        Close-Progress
        Show-Msg "pip安装失败，无法继续安装依赖包。`n`n请尝试：`n1. 删除以下目录后重试：`n   $PyDir`n2. 以管理员身份重新运行安装" -Icon 2
        Add-Log "  FAIL: pip bootstrap failed - $pipVerify"
        exit 1
    }
    Add-Log "  pip OK: $pipVerify"
}

# === 步骤3: 安装依赖 ===
# v3.12: Install-PipPkg 函数，pip install 失败时自动回退清华镜像源
Update-Progress "正在安装依赖包（首次可能较慢）..."
Add-Log "[3/7] 安装依赖"

function Install-PipPkg {
    param([string[]]$Packages)
    # v3.15: PyMuPDF 加 --only-binary=:all: 防止源码编译（Windows上编译必失败）
    # pypdf 是纯Python，不需要
    # v3.15: 优先从本地 extras/wheels/ 安装 .whl 文件，没有再联网
    $binaryPkgs = @("PyMuPDF")
    $normalPkgs = $Packages | Where-Object { $_ -notin $binaryPkgs }
    $needBinary = $Packages | Where-Object { $_ -in $binaryPkgs }

    $ok = $true

    # v3.15: 检查本地 wheel 缓存目录
    $localWheelDir = Join-Path $ScriptDir "extras\wheels"
    $hasLocalWheels = (Test-Path $localWheelDir) -and ((Get-ChildItem $localWheelDir -Filter "*.whl" -ErrorAction SilentlyContinue).Count -gt 0)

    # 先装纯Python包（一定成功）
    if ($normalPkgs) {
        $normalOk = $false
        # Try 0: 本地 wheel
        if ($hasLocalWheels) {
            Add-Log "  尝试从本地wheel安装..."
            try {
                $out = & $PyCmd -m pip install @($normalPkgs) --no-index --find-links $localWheelDir 2>&1
                $out | ForEach-Object { Add-Log "    $_" }
                if ($LASTEXITCODE -eq 0) { $normalOk = $true }
            } catch { Add-Log "    本地wheel安装失败: $_" }
        }
        # Try 1: normal pip install
        if (-not $normalOk) {
            try {
                $out = & $PyCmd -m pip install @($normalPkgs) 2>&1
                $out | ForEach-Object { Add-Log "    $_" }
                if ($LASTEXITCODE -eq 0) { $normalOk = $true }
            } catch { Add-Log "    pip install failed: $_" }
        }
        # Try 2: Tsinghua mirror
        if (-not $normalOk) {
            Add-Log "  Retrying with Tsinghua mirror..."
            try {
                $out = & $PyCmd -m pip install @($normalPkgs) -i https://pypi.tuna.tsinghua.edu.cn/simple 2>&1
                $out | ForEach-Object { Add-Log "    $_" }
                if ($LASTEXITCODE -eq 0) { $normalOk = $true }
            } catch { Add-Log "    Tsinghua mirror also failed: $_" }
        }
        # Try 3: ensure pip then retry
        if (-not $normalOk) {
            Add-Log "  Trying to bootstrap pip first..."
            try {
                & $PyCmd -m ensurepip 2>&1 | ForEach-Object { Add-Log "    $_" }
                $out = & $PyCmd -m pip install @($normalPkgs) -i https://pypi.tuna.tsinghua.edu.cn/simple 2>&1
                $out | ForEach-Object { Add-Log "    $_" }
                if ($LASTEXITCODE -eq 0) { $normalOk = $true }
            } catch { Add-Log "    ensurepip also failed: $_" }
        }
        if (-not $normalOk) { $ok = $false }
    }

    # 再装需要二进制wheel的包
    if ($needBinary) {
        foreach ($bpkg in $needBinary) {
            $bpkgOk = $false
            # Try 0: 本地 wheel + --only-binary
            if ($hasLocalWheels) {
                Add-Log "  尝试从本地wheel安装 $bpkg..."
                try {
                    $out = & $PyCmd -m pip install $bpkg --only-binary=:all: --no-index --find-links $localWheelDir 2>&1
                    $out | ForEach-Object { Add-Log "    $_" }
                    if ($LASTEXITCODE -eq 0) { $bpkgOk = $true }
                } catch { Add-Log "    本地wheel安装 $bpkg 失败: $_" }
            }
            # Try 1: --only-binary 防止源码编译
            if (-not $bpkgOk) {
                try {
                    $out = & $PyCmd -m pip install $bpkg --only-binary=:all: 2>&1
                    $out | ForEach-Object { Add-Log "    $_" }
                    if ($LASTEXITCODE -eq 0) { $bpkgOk = $true }
                } catch { Add-Log "    pip install --only-binary failed: $_" }
            }
            # Try 2: Tsinghua mirror + --only-binary
            if (-not $bpkgOk) {
                Add-Log "  Retrying binary with Tsinghua mirror..."
                try {
                    $out = & $PyCmd -m pip install $bpkg --only-binary=:all: -i https://pypi.tuna.tsinghua.edu.cn/simple 2>&1
                    $out | ForEach-Object { Add-Log "    $_" }
                    if ($LASTEXITCODE -eq 0) { $bpkgOk = $true }
                } catch { Add-Log "    Tsinghua binary also failed: $_" }
            }
            # Try 3: 不加 --only-binary（允许源码编译，作为最后手段）
            if (-not $bpkgOk) {
                Add-Log "  Retrying without --only-binary..."
                try {
                    $out = & $PyCmd -m pip install $bpkg -i https://pypi.tuna.tsinghua.edu.cn/simple 2>&1
                    $out | ForEach-Object { Add-Log "    $_" }
                    if ($LASTEXITCODE -eq 0) { $bpkgOk = $true }
                } catch { Add-Log "    Full retry also failed: $_" }
            }
            if (-not $bpkgOk) { $ok = $false }
        }
    }

    if (-not $ok) {
        Add-Log "  WARN: Some pip install attempts failed, service may have limited functionality"
    }
    return $ok
}

Install-PipPkg -Packages @("requests", "PyMuPDF", "pypdf")

# === 步骤3.5: 验证依赖可用性（v3.15 多机部署保障） ===
Add-Log "[3.5/7] 验证依赖"
$depStatus = @{}
$depDetail = @{}  # v3.15: 详细错误信息

# 验证 requests
$depStatus['requests'] = $false
try {
    $testOut = & $PyCmd -c "import requests; print(requests.__version__)" 2>&1
    if ($LASTEXITCODE -eq 0 -and "$testOut" -match '^\d') {
        $depStatus['requests'] = $true
        Add-Log "  requests: OK ($testOut)"
    } else {
        $depDetail['requests'] = "$testOut"
        Add-Log "  requests: import failed ($testOut)"
    }
} catch { $depDetail['requests'] = "$_"; Add-Log "  requests: test error: $_" }

# 验证 PyMuPDF (fitz) - v3.15: 捕获详细错误
$depStatus['fitz'] = $false
try {
    $testOut = & $PyCmd -c "import fitz; print(fitz.version[0])" 2>&1
    if ($LASTEXITCODE -eq 0 -and "$testOut" -match '^\d') {
        $depStatus['fitz'] = $true
        Add-Log "  PyMuPDF(fitz): OK ($testOut)"
    } else {
        # v3.15: 捕获详细错误（DLL load failed / ImportError 等）
        $errDetail = & $PyCmd -c "import fitz" 2>&1 | Out-String
        $depDetail['fitz'] = $errDetail.Trim()
        Add-Log "  PyMuPDF(fitz): import failed ($errDetail)"
    }
} catch { $depDetail['fitz'] = "$_"; Add-Log "  PyMuPDF(fitz): test error: $_" }

# v3.15: 验证 pypdf（纯Python保底）
$depStatus['pypdf'] = $false
try {
    $testOut = & $PyCmd -c "import pypdf; print(pypdf.__version__)" 2>&1
    if ($LASTEXITCODE -eq 0 -and "$testOut" -match '^\d') {
        $depStatus['pypdf'] = $true
        Add-Log "  pypdf: OK ($testOut)"
    } else {
        $depDetail['pypdf'] = "$testOut"
        Add-Log "  pypdf: import failed ($testOut)"
    }
} catch { $depDetail['pypdf'] = "$_"; Add-Log "  pypdf: test error: $_" }

# v3.15: PyMuPDF失败时，尝试安装VC++运行库（最常见原因：缺少MSVCP140.dll）
# 优先从本地 extras/ 取，没有再下载
if (-not $depStatus['fitz']) {
    Add-Log "  PyMuPDF不可用，尝试安装VC++运行库..."
    # 检查是否已安装 VC++ Redistributable
    $vcPaths = @(
        "${env:SystemRoot}\System32\vcruntime140.dll",
        "${env:SystemRoot}\System32\msvcp140.dll"
    )
    $vcMissing = $false
    foreach ($vp in $vcPaths) {
        if (-not (Test-Path $vp)) {
            Add-Log "    缺少: $vp"
            $vcMissing = $true
        }
    }
    if ($vcMissing) {
        # 优先本地 extras/vc_redist.x64.exe，没有再下载
        $localVcExe = Join-Path $ScriptDir "extras\vc_redist.x64.exe"
        $vcExe = Join-Path $InstDir "vc_redist.x64.exe"
        if (Test-Path $localVcExe) {
            Copy-Item $localVcExe -Destination $vcExe -Force
            Add-Log "    使用本地VC++运行库: $localVcExe"
        } else {
            $vcUrl = "https://aka.ms/vs/17/release/vc_redist.x64.exe"
            try {
                [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
                Invoke-WebRequest -Uri $vcUrl -OutFile $vcExe -UseBasicParsing
                Add-Log "    VC++ Redistributable 下载完成"
            } catch {
                Add-Log "    VC++ Redistributable 下载失败: $_"
                $vcExe = $null
            }
        }
        if ($vcExe -and (Test-Path $vcExe)) {
            Add-Log "    开始安装VC++运行库..."
            $vcProc = Start-Process -FilePath $vcExe -ArgumentList "/install /quiet /norestart" -Wait -PassThru
            if ($vcProc.ExitCode -eq 0 -or $vcProc.ExitCode -eq 3010) {
                Add-Log "    VC++ Redistributable 安装成功"
            } else {
                Add-Log "    VC++ Redistributable 安装返回码: $($vcProc.ExitCode)（可能需要管理员权限）"
            }
            Remove-Item $vcExe -Force -ErrorAction SilentlyContinue
        }
    } else {
        Add-Log "    VC++运行库已存在，PyMuPDF失败原因可能不是缺VC++"
    }

    # VC++ 安装后重试 PyMuPDF
    if ($vcMissing) {
        Add-Log "  重试 PyMuPDF 安装..."
        try {
            & $PyCmd -m pip install --force-reinstall PyMuPDF --only-binary=:all: 2>&1 | ForEach-Object { Add-Log "    $_" }
        } catch { Add-Log "    force-reinstall after VC++ failed: $_" }
        # 验证
        try {
            $retryOut = & $PyCmd -c "import fitz; print(fitz.version[0])" 2>&1
            if ($LASTEXITCODE -eq 0 -and "$retryOut" -match '^\d') {
                $depStatus['fitz'] = $true
                Add-Log "  PyMuPDF(fitz): VC++修复后 OK ($retryOut)"
            } else {
                Add-Log "  PyMuPDF(fitz): VC++修复后仍失败 ($retryOut)"
            }
        } catch { Add-Log "  PyMuPDF(fitz): VC++修复后验证error: $_" }
    }
}

# 对其他失败的依赖自动 force-reinstall（不含PyMuPDF，上面已单独处理）
foreach ($dep in @('requests', 'pypdf')) {
    if (-not $depStatus[$dep]) {
        Add-Log "  force-reinstall $dep ..."
        try {
            & $PyCmd -m pip install --force-reinstall $dep 2>&1 | ForEach-Object { Add-Log "    $_" }
            if ($LASTEXITCODE -eq 0) {
                $vOut = & $PyCmd -c "import $dep; print('ok')" 2>&1
                if ($LASTEXITCODE -eq 0) {
                    $depStatus[$dep] = $true
                    Add-Log "  $dep force-reinstall: OK"
                } else {
                    Add-Log "  $dep force-reinstall: STILL FAILED ($vOut)"
                }
            }
        } catch { Add-Log "    force-reinstall $dep failed: $_" }
    }
}

# === 步骤4: 部署文件 ===
Update-Progress "正在部署程序文件..."
Add-Log "[4/7] 部署文件"

$svcCopied = $false
@(
    @{ Src = Join-Path $ScriptDir "python-service\invoice_checker.py" },
    @{ Src = Join-Path $ScriptDir "service\invoice_checker.py" },
    @{ Src = Join-Path $ScriptDir "invoice_checker.py" }
) | ForEach-Object {
    if ((-not $svcCopied) -and (Test-Path $_.Src)) {
        Copy-Item $_.Src -Destination $SvcRoot -Force
        $svcCopied = $true
    }
}

if (-not $svcCopied -and -not (Test-Path "$SvcRoot\invoice_checker.py")) {
    Close-Progress
    Show-Msg "找不到服务代码文件！`n请确认安装包完整。" -Icon 2
    Add-Log "  FAIL: 找不到invoice_checker.py"
    exit 1
}

$extSrc = Join-Path $ScriptDir "chrome-extension"
if (Test-Path $extSrc) {
    Copy-Item "$extSrc\*" -Destination $ExtDir -Recurse -Force
}

@("安装指导.docx", "install-guide.docx", "InvoiceChecker-Install-Guide-v1.5.docx", "发票类型检查助手-安装指导.docx") | ForEach-Object {
    $gp = Join-Path $ScriptDir $_
    if (Test-Path $gp) { Copy-Item $gp -Destination $InstDir -Force }
}

# === 步骤5: 生成启动脚本 ===
Update-Progress "正在配置启动项..."
Add-Log "[5/7] 配置启动"

# --- start.bat: 启动Python服务 ---
$q = [char]34
$startBatLines = @(
    '@echo off'
    "cd /d $q$SvcRoot$q"
    "$q$PyCmd$q invoice_checker.py"
    'if %errorlevel% neq 0 ('
    '    echo Service error, closing in 5s...'
    '    timeout /t 5 >nul'
    ')'
)
Set-Content -Path "$SvcRoot\start.bat" -Value $startBatLines -Encoding Default

# --- start_silent.vbs: 静默启动 发票识别助手启动.bat（带日志功能） ---
$instDir = $InstDir  # 安装根目录（invoice识别助手启动.bat 在此）
$threeQ = $q + $q + $q
$startVbsLines = @(
    'Set ws = CreateObject("WScript.Shell")'
    "ws.Run $threeQ$instDir\发票识别助手启动.bat$threeQ, 0, False"
)
Set-Content -Path "$SvcRoot\start_silent.vbs" -Value $startVbsLines -Encoding Default

# --- 复制 guardian.ps1（确保 UTF-8 BOM） ---
# v3.12: 包裹 try/catch，写失败只警告不影响主流程
$guardianSrc = Join-Path $ScriptDir "guardian.ps1"
if (Test-Path $guardianSrc) {
    try {
        $gBytes = [IO.File]::ReadAllBytes($guardianSrc)
        if ($gBytes[0] -ne 0xEF) {
            $gBytes = [byte[]](0xEF,0xBB,0xBF) + $gBytes
        }
        [IO.File]::WriteAllBytes("$SvcRoot\guardian.ps1", $gBytes)
        Add-Log "  已复制guardian.ps1 (UTF-8 BOM)"
    } catch {
        Add-Log "  WARN: guardian.ps1 复制失败（不影响主服务）: $_"
    }
} else {
    Add-Log "  WARN: guardian.ps1未找到，跳过"
}

# --- guardian.vbs: 开机守护，直接用 powershell -File 调用 guardian.ps1 ---
# v3.10 修复开机 800A0401 错误：原 $threeQ (3个连续引号) 在 VBScript 中无法正确解析
# 改用 Chr(34) 拼接路径，100% 兼容任何 Windows 用户名（即使含空格）
$guardianVbsLines = @(
    'Set ws = CreateObject("WScript.Shell")'
    "ws.Run `"powershell -ExecutionPolicy Bypass -NoProfile -File `" & Chr(34) & `"$SvcRoot\guardian.ps1`" & Chr(34), 0, False"
)
Set-Content -Path "$SvcRoot\guardian.vbs" -Value $guardianVbsLines -Encoding Default

# --- 生成 发票识别助手启动.bat（含端口清理 + 自动启动 + 日志） ---
$launcherBat = Join-Path $InstDir "发票识别助手启动.bat"
$launcherLog = Join-Path $InstDir "invoice-launcher.log"
$svcLog = Join-Path $SvcRoot "invoice-service.log"
@"
@echo off
setlocal enabledelayedexpansion
REM 发票检查助手 - 启动服务 v3.0.11 (installer v3.22)
REM v3.22: 优先嵌入式Python，不再依赖系统Python版本
REM 安装目录: $InstDir
REM 日志: bat自身→invoice-launcher.log, Python服务→service\invoice-service.log

set "BASE_DIR=%~dp0"
set "BAT_LOG=%BASE_DIR%invoice-launcher.log"

REM 自动检测服务目录
if exist "%BASE_DIR%service\invoice_checker.py" (
    set "SVC_DIR=%BASE_DIR%service"
) else if exist "%BASE_DIR%python-service\invoice_checker.py" (
    set "SVC_DIR=%BASE_DIR%python-service"
) else (
    echo ===== %%DATE%% %%TIME%% ===== >> "%%BAT_LOG%%"
    echo [ERROR] Service directory not found! >> "%%BAT_LOG%%"
    exit /b 1
)

echo ===== %%DATE%% %%TIME%% ===== >> "%%BAT_LOG%%"
echo [LAUNCH] bat启动(安装版), BASE_DIR=%%BASE_DIR%% >> "%%BAT_LOG%%"

REM v3.22: 优先嵌入式Python（安装目录内），兼容系统Python(3.14/3.9)作为回退
set "PYTHON="
set "PY_HOME=%BASE_DIR%python"
if exist "%PY_HOME%\pythonw.exe" (
    set "PYTHON=%PY_HOME%\pythonw.exe"
    set "PYTHON_MODE=embedded(pythonw)"
) else if exist "%PY_HOME%\python.exe" (
    set "PYTHON=%PY_HOME%\python.exe"
    set "PYTHON_MODE=embedded(python)"
) else if exist "%%USERPROFILE%%\.workbuddy\binaries\python\versions\3.13.12\pythonw.exe" (
    set "PYTHON=%%USERPROFILE%%\.workbuddy\binaries\python\versions\3.13.12\pythonw.exe"
    set "PYTHON_MODE=pythonw(managed)"
) else if exist "%%USERPROFILE%%\.workbuddy\binaries\python\versions\3.13.12\python.exe" (
    set "PYTHON=%%USERPROFILE%%\.workbuddy\binaries\python\versions\3.13.12\python.exe"
    set "PYTHON_MODE=python(managed)"
) else (
    for %%%%v in (314 313 312 311 310 39) do (
        if exist "C:\Program Files\Python%%v\pythonw.exe" (
            set "PYTHON=C:\Program Files\Python%%v\pythonw.exe"
            set "PYTHON_MODE=pythonw(ProgramFiles\Python%%v)"
        )
        if exist "C:\Python%%v\pythonw.exe" (
            set "PYTHON=C:\Python%%v\pythonw.exe"
            set "PYTHON_MODE=pythonw(C:\Python%%v)"
        )
    )
)
if not defined PYTHON (
    echo [ERROR] Python not found! >> "%%BAT_LOG%%"
    exit /b 1
)
echo [LAUNCH] Python: %%PYTHON%% (%%PYTHON_MODE%%) >> "%%BAT_LOG%%"

REM 清理占用52100端口的旧进程
echo [LAUNCH] 检查端口 52100 旧进程... >> "%%BAT_LOG%%"
set "KILL_COUNT=0"
for /f "tokens=5" %%%%a in ('netstat -ano 2^>nul ^| findstr ":52100 "') do (
    set "PID=%%%%a"
    if not "!PID!"=="0" (
        echo [LAUNCH]   杀掉旧进程 PID=!PID! >> "%%BAT_LOG%%"
        taskkill /f /pid !PID! >nul 2>&1
        if !errorlevel!==0 set /a KILL_COUNT+=1
    )
)
if !KILL_COUNT! gtr 0 (
    echo [LAUNCH] 已清理 !KILL_COUNT! 个旧进程 >> "%%BAT_LOG%%"
    timeout /t 2 /nobreak >nul 2>&1
) else (
    echo [LAUNCH] 端口 52100 无旧进程 >> "%%BAT_LOG%%"
)

REM 启动服务（无窗口，后台运行）
echo [LAUNCH] 正在启动服务... >> "%%BAT_LOG%%"
cd /d "%%SVC_DIR%%"
start "" /b "%%PYTHON%%" invoice_checker.py
echo [LAUNCH] 已执行启动, exitCode=!errorlevel! >> "%%BAT_LOG%%"

REM 健康检查（最多等待10秒）
timeout /t 2 /nobreak >nul 2>&1
set "HEALTH_OK=0"
for /l %%%%i in (1,1,5) do (
    powershell -NoProfile -Command "try { `$r=Invoke-WebRequest 'http://127.0.0.1:52100/health' -TimeoutSec 2 -UseBasicParsing; if(`$r.StatusCode -eq 200){exit 0}} catch {exit 1}" >nul 2>&1
    if !errorlevel!==0 (
        set "HEALTH_OK=1"
        echo [LAUNCH] 服务就绪! (第%%%%i次检查) >> "%%BAT_LOG%%"
        goto :health_ok
    )
    timeout /t 2 /nobreak >nul 2>&1
)
echo [LAUNCH] 服务启动可能失败(健康检查5次均未通过) >> "%%BAT_LOG%%"
goto :end

:health_ok
echo [LAUNCH] 服务地址: http://127.0.0.1:52100 >> "%%BAT_LOG%%"
echo [LAUNCH] 服务日志: %%SVC_DIR%%\invoice-service.log >> "%%BAT_LOG%%"

:end
echo [LAUNCH] done >> "%%BAT_LOG%%"
"@ | Set-Content -Path $launcherBat -Encoding Default
Add-Log "  已生成 发票识别助手启动.bat (v3.0.11, installer v3.22, 嵌入式Python优先)"

# --- start_hidden.vbs: 静默启动入口 ---
$startHiddenVbs = Join-Path $SvcRoot "start_hidden.vbs"
@"
Dim fso, batPath
Set fso = CreateObject("Scripting.FileSystemObject")
batPath = "$launcherBat"
If fso.FileExists(batPath) Then
    CreateObject("WScript.Shell").Run "cmd /c """ & batPath & """", 0, False
End If
"@ | Set-Content -Path $startHiddenVbs -Encoding Default
Add-Log "  已生成 start_hidden.vbs"

# --- 创建开机启动快捷方式（指向静默vbs） ---
$startupDir = [Environment]::GetFolderPath("Startup")
$shortcutPath = Join-Path $startupDir "发票检查服务 (InvoiceChecker).lnk"
# 清理所有旧快捷方式
@("InvoiceChecker.lnk", "发票类型检查服务.lnk") | ForEach-Object {
    $old = Join-Path $startupDir $_
    if (Test-Path $old) { Remove-Item $old -Force -ErrorAction SilentlyContinue }
}
try {
    $ws = New-Object -ComObject WScript.Shell
    $sc = $ws.CreateShortcut($shortcutPath)
    $sc.TargetPath = $startHiddenVbs
    $sc.WorkingDirectory = $SvcRoot
    $sc.WindowStyle = 7
    $sc.Description = "发票检查服务 - 开机自动启动"
    $sc.Save()
    Add-Log "  已注册开机自启动: $shortcutPath"
} catch {
    Add-Log "  WARN: $_"
}

# --- 在当前用户桌面创建手动启动快捷方式 ---
$desktopDir = [Environment]::GetFolderPath("Desktop")
$desktopShortcut = Join-Path $desktopDir "发票识别助手 (手动启动).lnk"
try {
    $ws2 = New-Object -ComObject WScript.Shell
    $sc2 = $ws2.CreateShortcut($desktopShortcut)
    $sc2.TargetPath  = $launcherBat
    $sc2.WorkingDirectory = $InstDir
    $sc2.WindowStyle = 1   # 1=Normal（运行bat时弹出控制台窗口，便于用户看启动日志）
    $sc2.Description = "发票识别助手 - 手动启动服务（双击即可重新启动）"
    # 使用 cmd.exe 图标以便和自启动快捷方式区分
    $sc2.IconLocation = "%SystemRoot%\system32\cmd.exe,0"
    $sc2.Save()
    Add-Log "  已在桌面创建手动启动快捷方式: $desktopShortcut"
} catch {
    Add-Log "  WARN: 桌面快捷方式创建失败(非致命): $_"
}

# === 步骤6: 检测浏览器 ===
Update-Progress "正在检测浏览器..."
Add-Log "[6/7] 检测浏览器"

$edgePaths = @(
    "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
    "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
    "$env:LOCALAPPDATA\Microsoft\Edge\Application\msedge.exe"
)
$chromePaths = @(
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
    "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
)

$hasEdge = $false
$hasChrome = $false
foreach ($p in $edgePaths) { if (Test-Path $p) { $hasEdge = $true; break } }
foreach ($p in $chromePaths) { if (Test-Path $p) { $hasChrome = $true; break } }

Close-Progress

$browser = $null
if ($hasEdge -and $hasChrome) {
    $browser = Select-Browser
} elseif ($hasEdge) {
    $browser = "edge"
} elseif ($hasChrome) {
    $browser = "chrome"
} else {
    $dlChrome = Ask-YesNo "未检测到浏览器，是否自动下载安装 Chrome？`n`n选择「否」将退出安装。"
    if (-not $dlChrome) { exit 0 }

    Show-Progress -Title "正在下载Chrome..." -Message "请耐心等待"
    $chromeInstaller = Join-Path $InstDir "chrome_installer.exe"
    try {
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        Invoke-WebRequest -Uri "https://dl.google.com/chrome/win64/chrome_installer.exe" -OutFile $chromeInstaller -UseBasicParsing
        Close-Progress
        Update-Progress "正在安装Chrome..."
        Start-Process -FilePath $chromeInstaller -ArgumentList "/install" -Wait
        Remove-Item $chromeInstaller -Force -ErrorAction SilentlyContinue
        $browser = "chrome"
    } catch {
        Close-Progress
        Show-Msg "Chrome下载安装失败，请手动安装后重试。" -Icon 2
        exit 1
    }
}

Add-Log "  浏览器: $browser"

Show-Progress -Title "正在启动服务..." -Message "请稍候..."

# === 步骤7: 启动服务 ===
Add-Log "[7/7] 启动服务"

# v2.4.4: 先 kill 占用 52100 端口的旧 Python 进程（避免老版本残留）
try {
    $oldConns = Get-NetTCPConnection -LocalPort 52100 -State Listen -ErrorAction Stop
    foreach ($c in $oldConns) {
        $oldPid = $c.OwningProcess
        $oldProc = Get-Process -Id $oldPid -ErrorAction SilentlyContinue
        if ($oldProc -and $oldProc.ProcessName -eq 'python') {
            Add-Log "  结束旧 Python 进程 PID $oldPid"
            Stop-Process -Id $oldPid -Force -ErrorAction SilentlyContinue
        }
    }
    Start-Sleep -Seconds 2
} catch {
    # 端口未占用，无须 kill
}

$svcOK = $false
$healthInfo = $null
try {
    $resp = Invoke-WebRequest -Uri "http://127.0.0.1:52100/test" -UseBasicParsing -TimeoutSec 3
    $svcOK = $true
    # v3.14: 额外检查 /health
    try {
        $hResp = Invoke-WebRequest -Uri "http://127.0.0.1:52100/health" -UseBasicParsing -TimeoutSec 3
        $healthInfo = $hResp.Content | ConvertFrom-Json
    } catch {
        Add-Log "  /health check failed (old version?)"
    }
    Add-Log "  服务已在运行"
} catch {
    # v3.12: 修复关闭 PowerShell 窗口带走 Python 子进程的 bug
    # 直接用 Start-Process 启动 python（不依赖 vbs/bat/cmd 父进程）
    # Python 进程独立运行，PowerShell 关闭不会影响
    Add-Log "  启动 Python 服务（独立进程模式）..."
    try {
        $proc = Start-Process $PyCmd -ArgumentList "$SvcRoot\invoice_checker.py" -WindowStyle Hidden -PassThru
        Add-Log "  Python 进程已启动 PID: $($proc.Id)"
    } catch {
        Add-Log "  Start-Process 失败: $_"
    }

    for ($retry = 0; $retry -lt 10; $retry++) {
        Start-Sleep -Seconds 2
        try {
            $resp = Invoke-WebRequest -Uri "http://127.0.0.1:52100/test" -UseBasicParsing -TimeoutSec 3
            $svcOK = $true
            # v3.14: 检查 /health
            try {
                $hResp = Invoke-WebRequest -Uri "http://127.0.0.1:52100/health" -UseBasicParsing -TimeoutSec 3
                $healthInfo = $hResp.Content | ConvertFrom-Json
            } catch {}
            Add-Log "  服务已就绪 (第$($retry+1)次检查)"
            break
        } catch {
            Add-Log "  等待中... (第$($retry+1)次检查)"
        }
    }
}

# 回退1: 直接用Python启动
if (-not $svcOK) {
    Add-Log "  VBS启动失败，尝试直接Python启动..."
    try {
        Start-Process $PyCmd -ArgumentList "$SvcRoot\invoice_checker.py" -WindowStyle Hidden
        Start-Sleep -Seconds 5
        $resp = Invoke-WebRequest -Uri "http://127.0.0.1:52100/test" -UseBasicParsing -TimeoutSec 5
        $svcOK = $true
        # v3.14: 检查 /health
        try { $hResp = Invoke-WebRequest -Uri "http://127.0.0.1:52100/health" -UseBasicParsing -TimeoutSec 3; $healthInfo = $hResp.Content | ConvertFrom-Json } catch {}
        Add-Log "  直接Python启动成功"
    } catch {
        Add-Log "  直接Python启动失败: $_"
    }
}

# 回退2: 尝试系统Python（v3.22: 仅当嵌入式Python启动失败时的最后手段）
# 注意：此处会在系统Python上安装依赖，如果用户后续重装系统Python可能丢失
if (-not $svcOK) {
    $sysPy = Get-Command python -ErrorAction SilentlyContinue
    if ($sysPy) {
        Add-Log "  尝试系统Python启动..."
        try {
            & python -m pip install requests PyMuPDF 2>&1 | ForEach-Object { Add-Log "    pip: $_" }
        } catch {}
        try {
            Start-Process python -ArgumentList "$SvcRoot\invoice_checker.py" -WindowStyle Hidden
            Start-Sleep -Seconds 5
            $resp = Invoke-WebRequest -Uri "http://127.0.0.1:52100/test" -UseBasicParsing -TimeoutSec 5
            $svcOK = $true
            # v3.14: 检查 /health
            try { $hResp = Invoke-WebRequest -Uri "http://127.0.0.1:52100/health" -UseBasicParsing -TimeoutSec 3; $healthInfo = $hResp.Content | ConvertFrom-Json } catch {}
            Add-Log "  系统Python启动成功"
        } catch {
            Add-Log "  系统Python启动也失败: $_"
        }
    }
}

Add-Log "  服务最终状态: $(if($svcOK){'OK'}else{'FAIL'})"

# === 安装浏览器扩展 ===
Update-Progress "正在安装浏览器扩展..."

$browserExe = if ($browser -eq "chrome") { "chrome" } else { "msedge" }
$browserCN = if ($browser -eq "edge") { "Edge" } else { "Chrome" }

$browserProcs = Get-Process -Name $browserExe -ErrorAction SilentlyContinue
$closeBrowser = $true
if ($browserProcs) {
    Close-Progress
    $closeBrowser = Ask-YesNo "需要关闭 ${browserCN} 浏览器以安装扩展。`n`n请先保存好正在编辑的网页内容，然后点击「是」继续。`n`n选择「否」将跳过扩展安装，安装后需手动配置。"
    if ($closeBrowser) {
        Show-Progress -Title "正在安装浏览器扩展..." -Message "关闭浏览器中..."
        Stop-Process -Name $browserExe -Force -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 2
    }
}

$extLoaded = $false
$extPageUrl = if ($browser -eq "chrome") { "chrome://extensions" } else { "edge://extensions" }
if ($closeBrowser) {
    Update-Progress "正在加载扩展..."
    try {
        # 第一步：只启动浏览器并加载扩展，不传URL
        # 原因：Edge启动时如果带--load-extension会忽略edge:// URL（已知行为）
        # 改用"先启动+后导航"两步走
        $loadExtArg = "--load-extension=`"$ExtDir`""
        $fullScreenArg = "--start-maximized"
        $noFirstRunArg = "--no-first-run"
        $noDefaultArg = "--no-default-browser-check"
        # 用数组形式传参，避免PowerShell字符串模式把多个参数粘成一个
        if ($browser -eq "chrome") {
            Start-Process "chrome" -ArgumentList @($fullScreenArg, $noFirstRunArg, $noDefaultArg, $loadExtArg)
        } else {
            Start-Process "msedge" -ArgumentList @($fullScreenArg, $noFirstRunArg, $noDefaultArg, $loadExtArg)
        }
        $extLoaded = $true
        try { [DevModeDialogHelper]::StartAutoDismiss() } catch {}
        Add-Log "  浏览器已启动，扩展已加载"
    } catch {
        Add-Log "  扩展自动加载失败: $_"
    }
}

Close-Progress

# === 抑制开发者模式扩展警告（注册表策略） ===
Add-Log "[策略] 设置扩展管理策略"
try {
    if ($browser -eq "edge") {
        $policyPath = "HKCU:\SOFTWARE\Policies\Microsoft\Edge"
    } else {
        $policyPath = "HKCU:\SOFTWARE\Policies\Google\Chrome"
    }
    if (-not (Test-Path $policyPath)) {
        New-Item -Path $policyPath -Force -ErrorAction Stop | Out-Null
    }
    $extSettings = '{"*": {"installation_mode": "allowed"}}'
    New-ItemProperty -Path $policyPath -Name "ExtensionSettings" -Value $extSettings -PropertyType String -Force -ErrorAction Stop | Out-Null
    Add-Log "  策略已设置: $policyPath"
} catch {
    Add-Log "  策略设置失败(非致命，弹窗守护会自动处理): $_"
}

# === 创建扩展管理页快捷方式（供日后使用） ===
try {
    $extUrlFile = Join-Path $InstDir "open-extensions.url"
    @('[InternetShortcut]', "URL=$extPageUrl") | Set-Content -Path $extUrlFile -Encoding ASCII
    Add-Log "  已创建扩展管理页快捷方式: $extUrlFile"
} catch {
    Add-Log "  创建快捷方式失败(非致命): $_"
}

# === 最后一步提示日志（v3.10） ===
# v3.5/v3.6/v3.7/v3.8 四次踩坑完整记录：
#   v3.5: HTML 引导页 + 链接方案 → CSS { } 触发 -f FormatError，HTML 写空文件
#   v3.6: Start-Process msedge.exe "edge://extensions" → CreateProcess → Edge 启动但 URL 被忽略 → 空白新标签页
#   v3.7: [System.Diagnostics.Process]::Start("edge://extensions") → ShellExecute 协议处理器
#         → 用户实测：公司电脑 edge:// 没注册到默认应用 → 弹"用什么应用打开"对话框
#   v3.8: .NET ProcessStartInfo + msedge.exe --single-argument → 理论上 100% 工作
#         → 用户实测：仍不可靠（msedge 接收 URL 行为不一致）
#   v3.9: 彻底放弃自动调起！改为完成弹窗里直接显示可复制的 URL + 一键复制按钮
#         → 100% 一定成功（完全不依赖任何协议/命令行/注册表）
#   v3.10: 修复开机 guardian.vbs 800A0401 编译错误（Chr(34) 拼接路径）
Add-Log "  请在弹窗中复制 URL 粘贴到浏览器地址栏（v3.10 极简方案）"

# === 完成弹窗（v3.14: 显示依赖验证结果） ===
$svcStatus = if ($svcOK) { "正常运行" } else { "可能需要重启电脑" }

# v3.14: 构建依赖状态文本
$depSummary = ""
if ($healthInfo -and $healthInfo.deps) {
    $depSummary = "依赖检查："
    foreach ($depName in @('PyMuPDF', 'requests', 'pypdf')) {
        if ($healthInfo.deps.$depName) {
            $depObj = $healthInfo.deps.$depName
            if ($depObj.ok) {
                $verStr = if ($depObj.version) { " v$($depObj.version)" } else { "" }
                $depSummary += "`n  OK   $depName$verStr"
            } else {
                # v3.15: 显示详细错误（截断太长的DLL错误）
                $errShort = if ($depObj.error) { $depObj.error.ToString().Substring(0, [Math]::Min(60, $depObj.error.ToString().Length)) } else { "unknown" }
                $depSummary += "`n  FAIL $depName ($errShort)"
            }
        }
    }
} else {
    # 没有健康检查数据，用步骤3.5的验证结果
    $depSummary = "依赖检查："
    $depSummary += if ($depStatus['requests']) { "`n  OK   requests" } else { "`n  FAIL requests" }
    $depSummary += if ($depStatus['fitz']) { "`n  OK   PyMuPDF" } else { "`n  FAIL PyMuPDF" }
    $depSummary += if ($depStatus['pypdf']) { "`n  OK   pypdf" } else { "`n  FAIL pypdf" }
}

$form = New-Object System.Windows.Forms.Form
$form.Text = "发票类型检查助手"
$form.Size = New-Object System.Drawing.Size(500, 630)
$form.StartPosition = "CenterScreen"
$form.FormBorderStyle = "FixedDialog"
$form.MaximizeBox = $false
$form.MinimizeBox = $false
$form.TopMost = $true

# === 标题 + 状态 ===
$lbl1 = New-Object System.Windows.Forms.Label
$lbl1.Text = "安装完成！"
$lbl1.Font = New-Object System.Drawing.Font("微软雅黑", 12, [System.Drawing.FontStyle]::Bold)
$lbl1.Size = New-Object System.Drawing.Size(440, 30)
$lbl1.Location = New-Object System.Drawing.Point(20, 15)
$form.Controls.Add($lbl1)

$lbl2 = New-Object System.Windows.Forms.Label
$lbl2.Text = "服务状态：$svcStatus`n浏览器：$browserCN"
$lbl2.Font = New-Object System.Drawing.Font("微软雅黑", 9)
$lbl2.Size = New-Object System.Drawing.Size(440, 40)
$lbl2.Location = New-Object System.Drawing.Point(20, 50)
$form.Controls.Add($lbl2)

# v3.14: 依赖检查结果
$lblDep = New-Object System.Windows.Forms.Label
$lblDep.Text = $depSummary
$lblDep.Font = New-Object System.Drawing.Font("Consolas", 9)
# 如果有 FAIL 的项，用红色
$hasFail = ($depSummary -match 'FAIL')
$lblDep.ForeColor = if ($hasFail) { [System.Drawing.Color]::FromArgb(200, 50, 50) } else { [System.Drawing.Color]::FromArgb(0, 120, 0) }
$lblDep.Size = New-Object System.Drawing.Size(440, 85)
$lblDep.Location = New-Object System.Drawing.Point(20, 92)
$form.Controls.Add($lblDep)

$lblLog = New-Object System.Windows.Forms.Label
$lblLog.Text = "Install log: $LogFile"
$lblLog.Font = New-Object System.Drawing.Font("Consolas", 8)
$lblLog.ForeColor = [System.Drawing.Color]::Gray
$lblLog.Size = New-Object System.Drawing.Size(440, 18)
$lblLog.Location = New-Object System.Drawing.Point(20, 177)
$form.Controls.Add($lblLog)

# === URL 提示 + 可复制文本框（v3.9 极简方案核心） ===
$lblUrl = New-Object System.Windows.Forms.Label
$lblUrl.Text = "最后一步：复制下面 URL 到浏览器地址栏，按回车打开扩展管理页："
$lblUrl.Font = New-Object System.Drawing.Font("微软雅黑", 9, [System.Drawing.FontStyle]::Bold)
$lblUrl.Size = New-Object System.Drawing.Size(440, 30)
$lblUrl.Location = New-Object System.Drawing.Point(20, 198)
$form.Controls.Add($lblUrl)

$txtUrl = New-Object System.Windows.Forms.TextBox
$txtUrl.Text = $extPageUrl
$txtUrl.Font = New-Object System.Drawing.Font("Consolas", 11)
$txtUrl.Size = New-Object System.Drawing.Size(400, 28)
$txtUrl.Location = New-Object System.Drawing.Point(40, 233)
$txtUrl.ReadOnly = $true
$txtUrl.BackColor = [System.Drawing.Color]::FromArgb(255, 252, 220)  # 浅黄底，醒目
$txtUrl.BorderStyle = "FixedSingle"
$form.Controls.Add($txtUrl)
# 默认全选 URL（用户一点就能 Ctrl+C 复制）
$txtUrl.SelectionStart = 0
$txtUrl.SelectionLength = $txtUrl.Text.Length

# === 步骤说明 ===
$lblStep1 = New-Object System.Windows.Forms.Label
$lblStep1.Text = "1. 打开左侧「开发人员模式」开关"
$lblStep1.Font = New-Object System.Drawing.Font("微软雅黑", 9)
$lblStep1.Size = New-Object System.Drawing.Size(440, 22)
$lblStep1.Location = New-Object System.Drawing.Point(30, 268)
$form.Controls.Add($lblStep1)

$lblStep2 = New-Object System.Windows.Forms.Label
$lblStep2.Text = "2. 点击「加载已解压的扩展程序」"
$lblStep2.Font = New-Object System.Drawing.Font("微软雅黑", 9)
$lblStep2.Size = New-Object System.Drawing.Size(440, 22)
$lblStep2.Location = New-Object System.Drawing.Point(30, 292)
$form.Controls.Add($lblStep2)

$lblStep3 = New-Object System.Windows.Forms.Label
$lblStep3.Text = "3. 选择文件夹（路径可一键复制）："
$lblStep3.Font = New-Object System.Drawing.Font("微软雅黑", 9)
$lblStep3.Size = New-Object System.Drawing.Size(440, 22)
$lblStep3.Location = New-Object System.Drawing.Point(30, 316)
$form.Controls.Add($lblStep3)

# === 扩展路径文本框（可复制） ===
$txtPath = New-Object System.Windows.Forms.TextBox
$txtPath.Text = $ExtDir
$txtPath.Font = New-Object System.Drawing.Font("Consolas", 9)
$txtPath.Size = New-Object System.Drawing.Size(400, 28)
$txtPath.Location = New-Object System.Drawing.Point(40, 342)
$txtPath.ReadOnly = $true
$txtPath.BackColor = [System.Drawing.Color]::White
$txtPath.BorderStyle = "FixedSingle"
$form.Controls.Add($txtPath)
# 默认全选路径
$txtPath.SelectionStart = 0
$txtPath.SelectionLength = $txtPath.Text.Length

# === 提示 ===
$lblHint = New-Object System.Windows.Forms.Label
$lblHint.Text = "提示：URL 和路径文本框已默认全选，点一下按 Ctrl+C 复制；或用下面的一键复制按钮。`n如需卸载，请运行 uninstall.bat"
$lblHint.Font = New-Object System.Drawing.Font("微软雅黑", 8)
$lblHint.ForeColor = [System.Drawing.Color]::Gray
$lblHint.Size = New-Object System.Drawing.Size(440, 40)
$lblHint.Location = New-Object System.Drawing.Point(20, 378)
$form.Controls.Add($lblHint)

# === 桌面快捷方式提示 ===
$lblDesktop = New-Object System.Windows.Forms.Label
$lblDesktop.Text = "🖥️ 已在桌面创建「发票识别助手 (手动启动)」快捷方式`n    服务异常时双击即可手动重新启动（会显示控制台窗口便于排查）"
$lblDesktop.Font = New-Object System.Drawing.Font("微软雅黑", 8)
$lblDesktop.ForeColor = [System.Drawing.Color]::FromArgb(0, 128, 64)
$lblDesktop.Size = New-Object System.Drawing.Size(440, 40)
$lblDesktop.Location = New-Object System.Drawing.Point(20, 420)
$form.Controls.Add($lblDesktop)

# === 按钮区 ===
# 左边按钮：📋 复制URL到剪贴板
$btnCopyUrl = New-Object System.Windows.Forms.Button
$btnCopyUrl.Text = "📋 复制URL"
$btnCopyUrl.Font = New-Object System.Drawing.Font("微软雅黑", 9, [System.Drawing.FontStyle]::Bold)
$btnCopyUrl.Size = New-Object System.Drawing.Size(120, 38)
$btnCopyUrl.Location = New-Object System.Drawing.Point(50, 475)
$btnCopyUrl.BackColor = [System.Drawing.Color]::FromArgb(0, 120, 215)
$btnCopyUrl.ForeColor = [System.Drawing.Color]::White
$btnCopyUrl.Add_Click({
    try {
        [System.Windows.Forms.Clipboard]::SetText($script:extPageUrl)
        [System.Windows.Forms.MessageBox]::Show(
            "URL 已复制到剪贴板！`n`n$($script:extPageUrl)`n`n请切换到浏览器：地址栏 Ctrl+V 粘贴，按回车打开",
            "复制成功",
            [System.Windows.Forms.MessageBoxButtons]::OK,
            [System.Windows.Forms.MessageBoxIcon]::Information)
    } catch {
        [System.Windows.Forms.MessageBox]::Show(
            "复制失败：$($_.Exception.Message)`n`n请手动操作：点击上面 URL 文本框，按 Ctrl+C 复制",
            "复制失败",
            [System.Windows.Forms.MessageBoxButtons]::OK,
            [System.Windows.Forms.MessageBoxIcon]::Warning)
    }
})
$form.Controls.Add($btnCopyUrl)

# 中间按钮：📋 复制扩展路径
$btnCopyPath = New-Object System.Windows.Forms.Button
$btnCopyPath.Text = "📋 复制路径"
$btnCopyPath.Font = New-Object System.Drawing.Font("微软雅黑", 9, [System.Drawing.FontStyle]::Bold)
$btnCopyPath.Size = New-Object System.Drawing.Size(120, 38)
$btnCopyPath.Location = New-Object System.Drawing.Point(190, 475)
$btnCopyPath.BackColor = [System.Drawing.Color]::FromArgb(16, 124, 16)
$btnCopyPath.ForeColor = [System.Drawing.Color]::White
$btnCopyPath.Add_Click({
    try {
        [System.Windows.Forms.Clipboard]::SetText($script:extDir)
        [System.Windows.Forms.MessageBox]::Show(
            "扩展路径已复制到剪贴板！`n`n$($script:extDir)`n`n在文件选择框中按 Ctrl+V 粘贴即可",
            "复制成功",
            [System.Windows.Forms.MessageBoxButtons]::OK,
            [System.Windows.Forms.MessageBoxIcon]::Information)
    } catch {
        [System.Windows.Forms.MessageBox]::Show(
            "复制失败：$($_.Exception.Message)`n`n请手动操作：点击下面路径文本框，按 Ctrl+C 复制",
            "复制失败",
            [System.Windows.Forms.MessageBoxButtons]::OK,
            [System.Windows.Forms.MessageBoxIcon]::Warning)
    }
})
$form.Controls.Add($btnCopyPath)

# 右边按钮：确定
$btnOK = New-Object System.Windows.Forms.Button
$btnOK.Text = "确定"
$btnOK.Font = New-Object System.Drawing.Font("微软雅黑", 9)
$btnOK.Size = New-Object System.Drawing.Size(90, 38)
$btnOK.Location = New-Object System.Drawing.Point(330, 475)
$btnOK.Add_Click({ $form.Close() })
$form.Controls.Add($btnOK)
$form.AcceptButton = $btnOK

[void]$form.ShowDialog()
$form.Dispose()

# === 最终日志 ===
$logTime = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
$logSvc = if($svcOK){'OK'}else{'FAIL'}
Add-Content -Path $LogFile -Value "==========================================" -Encoding UTF8
Add-Content -Path $LogFile -Value "  安装完成" -Encoding UTF8
Add-Content -Path $LogFile -Value "  时间: $logTime" -Encoding UTF8
Add-Content -Path $LogFile -Value "  服务: $logSvc" -Encoding UTF8
Add-Content -Path $LogFile -Value "  浏览器: $browser" -Encoding UTF8
Add-Content -Path $LogFile -Value "  扩展目录: $ExtDir" -Encoding UTF8
# v3.15: 记录依赖验证结果（含pypdf）
$depLog = @()
foreach ($dk in @('requests', 'fitz', 'pypdf')) {
    $depLog += "  $($dk): $(if($depStatus[$dk]){'OK'}else{'FAIL'})"
}
Add-Content -Path $LogFile -Value ($depLog -join "`n") -Encoding UTF8
Add-Content -Path $LogFile -Value "  日志: $LogFile" -Encoding UTF8
Add-Content -Path $LogFile -Value "==========================================" -Encoding UTF8

[Console]::OutputEncoding = [System.Text.Encoding]::Default

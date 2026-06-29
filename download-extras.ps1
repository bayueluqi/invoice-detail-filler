# Download extras for offline install (China mirrors)
# v2.5.0  日期: 2026-06-23  制作人: 陆琦
# Run: double-click download-extras.bat

$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$ScriptDir = $PSScriptRoot
if (-not $ScriptDir) { $ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path }
$extrasDir = Join-Path $ScriptDir "extras"
$wheelsDir = Join-Path $extrasDir "wheels"

if (-not (Test-Path $extrasDir)) { New-Item -Path $extrasDir -ItemType Directory -Force | Out-Null }
if (-not (Test-Path $wheelsDir)) { New-Item -Path $wheelsDir -ItemType Directory -Force | Out-Null }

Write-Host "=== Downloading extras (China mirrors) ===" -ForegroundColor Cyan

# 1. Python embeddable zip (~10MB) - huawei mirror
$pyZip = Join-Path $extrasDir "python-3.11.9-embed-amd64.zip"
if (-not (Test-Path $pyZip)) {
    Write-Host "[1/4] Downloading Python 3.11.9 (~10MB) from huawei mirror..." -ForegroundColor Yellow
    Invoke-WebRequest -Uri "https://mirrors.huaweicloud.com/python/3.11.9/python-3.11.9-embed-amd64.zip" -OutFile $pyZip -UseBasicParsing
    Write-Host "  OK: $([Math]::Round((Get-Item $pyZip).Length/1MB, 1))MB" -ForegroundColor Green
} else {
    Write-Host "[1/4] Python zip already exists, skip" -ForegroundColor Gray
}

# 2. get-pip.py - bootcdn mirror
$getPip = Join-Path $extrasDir "get-pip.py"
if (-not (Test-Path $getPip)) {
    Write-Host "[2/4] Downloading get-pip.py..." -ForegroundColor Yellow
    try {
        Invoke-WebRequest -Uri "https://cdn.jsdelivr.net/npm/pip@24.0/get-pip.py" -OutFile $getPip -UseBasicParsing
    } catch {
        Write-Host "  jsdelivr failed, trying bootstrap.pypa.io..." -ForegroundColor Yellow
        Invoke-WebRequest -Uri "https://bootstrap.pypa.io/get-pip.py" -OutFile $getPip -UseBasicParsing
    }
    Write-Host "  OK" -ForegroundColor Green
} else {
    Write-Host "[2/4] get-pip.py already exists, skip" -ForegroundColor Gray
}

# 3. VC++ Redistributable (~25MB) - Microsoft direct link (usually OK in China)
$vcExe = Join-Path $extrasDir "vc_redist.x64.exe"
if (-not (Test-Path $vcExe)) {
    Write-Host "[3/4] Downloading VC++ Redistributable (~25MB)..." -ForegroundColor Yellow
    Invoke-WebRequest -Uri "https://aka.ms/vs/17/release/vc_redist.x64.exe" -OutFile $vcExe -UseBasicParsing
    Write-Host "  OK: $([Math]::Round((Get-Item $vcExe).Length/1MB, 1))MB" -ForegroundColor Green
} else {
    Write-Host "[3/4] VC++ Redistributable already exists, skip" -ForegroundColor Gray
}

# 4. pip wheels - use Tsinghua mirror
Write-Host "[4/4] Downloading pip wheels from Tsinghua mirror..." -ForegroundColor Yellow
$pyDir = Join-Path $env:LOCALAPPDATA "InvoiceChecker\python"
$pyCmd = if (Test-Path "$pyDir\python.exe") { "$pyDir\python.exe" } else { "python" }

& $pyCmd -m pip download requests PyMuPDF pypdf -d $wheelsDir --only-binary=:all: --platform win_amd64 --python-version 311 -i https://pypi.tuna.tsinghua.edu.cn/simple 2>&1 | ForEach-Object { Write-Host "  $_" }

Write-Host ""
Write-Host "=== Done! ===" -ForegroundColor Cyan
Get-ChildItem $extrasDir -Recurse | Where-Object { -not $_.PSIsContainer } | ForEach-Object {
    Write-Host ("  " + $_.FullName.Replace($extrasDir + '\', '') + " ($([Math]::Round($_.Length/1MB, 1))MB)")
}
$totalMB = [Math]::Round((Get-ChildItem $extrasDir -Recurse | Where-Object { -not $_.PSIsContainer } | Measure-Object -Property Length -Sum).Sum/1MB, 1)
Write-Host "Total: $totalMB MB" -ForegroundColor Cyan

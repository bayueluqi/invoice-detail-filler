# Fix broken Python zip download
# v2.5.0  日期: 2026-06-23  制作人: 陆琦
$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$dest = Join-Path $PSScriptRoot "extras\python-3.11.9-embed-amd64.zip"

# Remove broken file
if (Test-Path $dest) { Remove-Item $dest -Force }

$mirrors = @(
    @{Name="npmmirror(淘宝)"; Url="https://registry.npmmirror.com/-/binary/python/3.11.9/python-3.11.9-embed-amd64.zip"},
    @{Name="huaweicloud"; Url="https://mirrors.huaweicloud.com/python/3.11.9/python-3.11.9-embed-amd64.zip"},
    @{Name="python.org(official)"; Url="https://www.python.org/ftp/python/3.11.9/python-3.11.9-embed-amd64.zip"}
)

$ok = $false
foreach ($m in $mirrors) {
    Write-Host "Trying $($m.Name)..." -ForegroundColor Yellow
    try {
        Invoke-WebRequest -Uri $m.Url -OutFile $dest -UseBasicParsing
        $size = [Math]::Round((Get-Item $dest).Length / 1MB, 1)
        if ($size -ge 8) {
            Write-Host "  OK! Downloaded $size MB from $($m.Name)" -ForegroundColor Green
            $ok = $true
            break
        } else {
            Write-Host "  File too small ($size MB), removing and trying next mirror..." -ForegroundColor Red
            Remove-Item $dest -Force
        }
    } catch {
        Write-Host "  Failed: $_" -ForegroundColor Red
        if (Test-Path $dest) { Remove-Item $dest -Force -ErrorAction SilentlyContinue }
    }
}

if (-not $ok) {
    Write-Host "All mirrors failed. Please download manually:" -ForegroundColor Red
    Write-Host "  https://www.python.org/ftp/python/3.11.9/python-3.11.9-embed-amd64.zip" -ForegroundColor Cyan
    Write-Host "  Save to: $dest" -ForegroundColor Cyan
}

Write-Host ""
Write-Host "Press any key to close..."
pause >nul

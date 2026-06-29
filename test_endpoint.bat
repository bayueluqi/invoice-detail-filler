@echo off
REM 测试接口 v2.5.0
REM 日期: 2026-06-23  制作人: 陆琦
echo === Test /check-invoice with sample image ===
echo.

REM 用 Python 构造一个最小的 1x1 JPEG 然后 POST 上去
powershell -NoProfile -Command "$b64 = '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/2wBDAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wgARCAABAAEDAREAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQBAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhADEAAAAVMP/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABBQJ//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPwF//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPwF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQAGPwJ//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPyF//9oADAMBAAIAAwAAABCf/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPxB//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPxB//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxB//9k='; $body = @{ file_data = $b64; file_name = 'test.jpg'; selected_type = '专票' } | ConvertTo-Json -Compress; Write-Host 'POST /check-invoice (timeout 30s)...'; $sw = [Diagnostics.Stopwatch]::StartNew(); try { $r = Invoke-WebRequest -Uri 'http://127.0.0.1:52100/check-invoice' -Method Post -ContentType 'application/json' -Body $body -UseBasicParsing -TimeoutSec 30; $sw.Stop(); Write-Host ('OK in ' + $sw.ElapsedMilliseconds + 'ms'); Write-Host '---'; Write-Host $r.Content } catch { $sw.Stop(); Write-Host ('FAILED in ' + $sw.ElapsedMilliseconds + 'ms: ' + $_.Exception.Message); if ($_.Exception.Response) { $reader = [IO.StreamReader]::new($_.Exception.Response.GetResponseStream()); Write-Host 'Body:'; Write-Host $reader.ReadToEnd() } }"
echo.
timeout /t 5 >nul

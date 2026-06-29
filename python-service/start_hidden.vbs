' 发票检查助手 - 静默启动 v3.0.8
' 开机自启动入口：完全无窗口，调用后台启动脚本
' 日期: 2026-06-26  制作人: 陆琦

Dim scriptDir, rootDir, batPath, fso

Set fso = CreateObject("Scripting.FileSystemObject")
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
rootDir = fso.GetParentFolderName(scriptDir)
batPath = rootDir & "\发票识别助手启动.bat"

If fso.FileExists(batPath) Then
    CreateObject("WScript.Shell").Run "cmd /c """ & batPath & """", 0, False
End If

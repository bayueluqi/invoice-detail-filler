# 发票识别助手 (invoice-detail-filler)

Chrome MV3 扩展 + Python OCR 服务，自动识别增值税发票并填入企业 OA 系统。

- 当前版本：v3.0.47
- 技术栈：Chrome MV3 Extension + Python 3.11 (嵌入式) + 腾讯云 OCR
- 功能：发票明细自动识别、购买方/金额校验、提交再查模式

## 目录结构
- `chrome-extension/` — Chrome MV3 扩展（content.js / background.js / manifest.json）
- `python-service/` — Python OCR 服务（invoice_checker.py，端口 52100）
- 批处理脚本 — 安装/启动/诊断工具

> 本仓库历史由 Git Data API 完整推送。

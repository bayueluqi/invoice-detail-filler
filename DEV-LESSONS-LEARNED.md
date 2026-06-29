# Invoice Checker 开发踩坑经验总结

> 2026-06-22 整理，覆盖 v2.4.5 ~ v2.4.6 + install.ps1 v3.10 ~ v3.12 全周期

---

## 一、PowerShell / bat 编码问题（最高频踩坑）

### 1. write_file 写 .bat 文件中文全部乱码
- **根因**：write_file 无法写 UTF-8 BOM，Windows cmd 默认用 GBK 解码，中文字符全部变成乱码，甚至被 cmd 误认为命令名执行
- **解法**：bat 文件内部**只用 ASCII 英文**，一行中文都不要写
- **教训**：凡是 cmd 要执行的 .bat，内容必须全英文

### 2. PowerShell 5.1 源码里中文 string literal 被解析成乱码
- **根因**：PowerShell 5.1 默认用系统编码（GBK）解析 .ps1 文件，UTF-8 无 BOM 的 ps1 文件里中文全部乱码
- **表现**：`$dst = "D:\TEMP\COZE\发票类型检查助手.docx"` → .NET 报"路径中具有非法字符"
- **解法**：ps1 里的路径/字符串变量**全用英文**，输出显示文字可以保留少量中文（.NET 内部是 Unicode 不受影响）
- **教训**：ps1 源码中所有路径变量、字符串变量一律用英文，不依赖文件编码

### 3. PowerShell 执行 ps1 脚本的最佳实践
- **绝不要用** `Invoke-Expression` 执行 Get-Content 读出的 .ps1 内容（二次解析灾难）
- **最稳定方式**：写入 UTF-8 BOM 的 .ps1 文件，用 `powershell -File` 调用
- **中文 Windows 兼容**：无 BOM 的 UTF-8 文件被 PowerShell -File 读取时中文全部乱码；需要自动检测并追加 BOM

---

## 二、版本号同步（必检项）

### 4. Chrome 扩展版本号漏改
- **现象**：manifest.json 改了 2.4.6，Edge 扩展管理页也显示 2.4.6，但右下角浮窗还显示 2.4.5
- **根因**：showFloat 函数内部 HTML 字符串写死了版本号，改了文件头注释和 console.log 但**漏了浮窗 HTML**
- **教训**：每次升版本号，必须**全文搜索**旧版本号字符串，逐个确认替换。自查清单：
  - [ ] manifest.json → version 字段
  - [ ] content.js → 文件头注释
  - [ ] content.js → showFloat 浮窗 HTML 字符串
  - [ ] content.js → 末尾 console.log
  - [ ] background.js → 头部注释
  - [ ] background.js → 启动日志
  - [ ] 所有文件 → 全文 grep 旧版本号确认无遗漏

### 5. install.ps1 日志头版本号没改
- **现象**：install.ps1 升级到 v3.12，但日志头还是 `v3.10`
- **教训**：升级版本时 grep 所有版本号引用点，不能只改文件头注释

---

## 三、write_file 文件损坏

### 6. write_file 写大文件尾部被截断+重复
- **现象**：install.ps1 写入 D 盘后，尾部 line 784 出现截断乱码 `gTime" -Encoding UTF8`，后面跟了 6 行重复的 Add-Content
- **影响**：PowerShell 执行时报 `Unexpected token 'Encoding:UTF8'` 和 `字符串缺少终止符`
- **解法**：read_file 验证文件尾部内容，发现后用 edit_file 删除重复行
- **教训**：**write_file 写完大文件（>500 行）后，必须 read_file 检查首尾**，不能盲目信任

### 7. edit_file 旧字符串含 BOM 时匹配失败
- **现象**：第一次 edit v3.11→v3.12 头部注释时报成功，但 read_file 发现没改
- **根因**：文件开头有 BOM 字节（0xEF 0xBB 0xBF），edit_file 的 old_string 没包含 BOM 导致匹配不到
- **教训**：edit_file 改文件开头内容时，先 read_file 看看有没有 BOM

---

## 四、Python 路径问题（同事电脑部署核心坑）

### 8. bat 里用裸 `python` 命令找不到
- **现象**：同事 3 双击 `发票识别助手启动.bat`，报 error code 9009（`python 不是内部或外部命令`）
- **根因**：bat 里写 `python invoice_checker.py`，但同事电脑没有系统 Python，install.ps1 装的是内置 Python（`%LOCALAPPDATA%\InvoiceChecker\python\python.exe`），不在 PATH 里
- **解法**：bat 里先检查内置 Python 路径，找不到再 fallback 到系统 Python
  ```bat
  if exist "%LOCALAPPDATA%\InvoiceChecker\python\python.exe" (
      set "PY=%LOCALAPPDATA%\InvoiceChecker\python\python.exe"
  )
  ```
- **教训**：**永远不要在 bat 里用裸 `python`**，必须先定位 Python 可执行文件的完整路径

### 9. install.ps1 生成的 start.bat 没这个问题
- install.ps1 用 `$PyCmd`（安装时确定的完整 Python 路径）写 start.bat，所以 start.bat 是对的
- **但根目录的 `发票识别助手启动.bat` 是单独写的，没用 install.ps1 的模板**
- **教训**：所有启动脚本必须统一用相同逻辑找 Python，不能手写裸命令

---

## 五、pip 依赖安装

### 10. pip install 失败无回退
- **现象**：同事 3 电脑 pip 不在 PATH，`python -m pip install` 也可能因为网络问题失败
- **根因**：install.ps1 v3.11 步骤 3 只有一行 `& $PyCmd -m pip install requests PyMuPDF`，失败就失败，没有回退
- **解法**：v3.12 加了 Install-PipPkg 函数，三级回退：
  1. 正常 pip install
  2. 清华镜像源 `-i https://pypi.tuna.tsinghua.edu.cn/simple`
  3. ensurepip 先修 pip 再装
- **教训**：**企业网络环境 pip 随时可能失败**，必须有镜像源回退机制

### 11. Install-PipPkg 函数承诺了但没写
- **现象**：install.ps1 v3.12 头部注释写了"pip install 失败回退清华镜像源"，但步骤 3 还是老写法
- **根因**：上下文切换时只改了注释没改代码
- **教训**：**改版本注释和改代码必须原子操作**，不能先改注释"标记要做"然后忘了做

---

## 六、进程管理

### 12. PowerShell 关闭带走 Python 子进程
- **现象**：install.ps1 安装完成后，关闭 PowerShell 窗口，Python 服务也跟着死了
- **根因**：v3.11 用 VBS 链路启动 Python（PowerShell → VBS → cmd → Python），关闭 PowerShell 级联杀掉整个进程树
- **解法**：v3.12 改用 `Start-Process $PyCmd -ArgumentList ... -WindowStyle Hidden -PassThru`，Python 作为独立进程，PowerShell 关闭不影响
- **教训**：**需要长期运行的服务进程必须用 Start-Process 独立启动**，不能依赖父进程链

### 13. 旧端口残留
- **现象**：重装后旧版本 Python 还在 52100 端口运行
- **解法**：install.ps1 v3.11 加了启动前 kill 52100 端口旧 Python 进程的逻辑
- **教训**：服务安装脚本启动前先检查端口占用，kill 旧进程再启动新版本

---

## 七、content.js v2.4.6 核心修复

### 14. 无附件时切换发票类型仍触发自动识别
- **现象**：上传附件后删除，切换发票类型时浮窗显示"正在识别发票类型"
- **根因**：三个触发点（observer 回调、onClickRadio、onFileChange）都只检查 `lastCapturedFile` 变量是否有值，不检查页面 DOM 是否真的有附件
- **解法**：新增 `hasUploadedFile()` 函数扫描 DOM（`.el-upload-list__item` / `.ant-upload-list-item` / `input[type=file]`），三处加双重保险
- **教训**：**不能只靠 JS 变量判断状态，必须检查真实 DOM**。变量可能残留（删除附件时没清空），但 DOM 是实时可信的

---

## 八、通用开发原则

### 15. write_file 写完大文件必须验证首尾
- 不能信任 write_file 100% 正确，特别是 >500 行的文件
- 验证方法：read_file 读首 10 行 + 末 20 行

### 16. edit_file 后 read_file 确认
- edit_file 报成功不等于真的改了（BOM 匹配问题、old_string 不唯一等）
- 关键修改后必须 read_file 回验

### 17. 同事电脑环境不等于你的电脑
- Python 可能不在 PATH
- pip 可能装不上（企业网络/防火墙）
- 磁盘路径可能不同（D: vs C:）
- 浏览器可能只有 Edge 没有 Chrome
- **所有脚本必须兼容最小环境**，不假设任何系统级工具可用

### 18. 版本升级检查清单
每次升版本号，严格执行以下步骤：
1. **全文 grep 旧版本号**，逐个替换
2. **manifest.json → content.js → background.js → install.ps1** 四个文件必查
3. **浮窗 HTML 字符串里的版本号**最容易漏，单独检查
4. **改完后 read_file 验证**，不能只信工具返回的 "success"

---

## 九、v2.5.12-fix 批次（2026-06-25 静态审查修复）

> 本次为代码静态审查发现的 6 个 bug，其中 2 个高危直接导致「专票税率填不进去」。修复后全部通过语法校验 + 单元测试。

### 19. 税率下拉匹配换算错误（高危，content.js）
- **现象**：专票场景，AI 返回 13% / 9% / 1.5% 等税率后，下拉框永远选不中，税率字段空白
- **根因**：旧匹配逻辑 `'0.0' + rateNum` 是**字符串拼接**而非除法换算：
  - 13% → `'0.0' + '13'` = `'0.013'`（真实选项是 `'0.13'`，永远匹配不上）
  - 6% → `'0.06'`（恰好对，纯属巧合蒙对）
  - 1.5% → `(1.5/100).toFixed(2)` = `'0.02'`（丢精度，应为 0.015）
- **解法**：抽 `matchRateLabel(optLabel, rateStr, rateNum, rateDecimal)` 公共函数，用 `rateVal / 100` 正确换算，统一兼容 `13%` / `13` / `0.13` / `.13` / `0.015` 五种选项写法
- **教训**：**涉及数值换算的字符串比较，绝对不能用字符串拼接代替算术运算**。`'0.0' + n` 看起来对单位数成立，两位数立刻翻车。必须走 `parseFloat + 除法 + toFixed`

### 20. extract_detail 提前 return 导致 AI 兜底失效（高危，invoice_checker.py）
- **现象**：专票场景，文本能提到价税合计金额但提不到税率时，税率字段永远空，AI 兜底也补不上
- **根因**：`extract_detail` 主流程里 `if result['amount']: return result` —— 只要金额存在就**提前返回**，跳过了下面的 `extract_detail_ai` 兜底逻辑
- **解法**：改为「金额 + 税率/税额 三者全齐」才提前返回：`if result['amount'] and (result['tax_rate'] or result['tax_amount'] or result['is_multi_rate']): return result`
- **教训**：**「文本优先 → AI 兜底」架构里，提前 return 的条件必须等于「全部目标字段已齐」**，不能只看某个字段。少一个字段就应继续往下走兜底，否则兜底层形同虚设

### 21. 税率小数形式正则漏匹配 + 噪音误判（中危，invoice_checker.py）
- **现象**：1.5% 的小数形式 `0.015`（3 位小数）无法识别；`0.5` 这类非税率小数被误判为 50% 税率
- **根因**：
  1. 正则 `r'(?<!\d)(0?\.\d{1,2})(?!\d)'` 中 `\d{1,2}` 只匹配 1~2 位小数，`0.015` 漏掉
  2. 过滤条件 `0 <= v <= 17` 用了闭区间下界 0，把 `0.0`（→0%）和无关小数也纳入
- **解法**：正则放宽到 `\d{1,3}`；过滤改为 `0 < v <= 17`（小数形式排除 0，因为真 0% 会以 `0%` 形式出现，走带%分支保留）
- **教训**：**正则的位数限制要覆盖所有合法值的位数**。1.5% 是合法税率，其小数形式必然 3 位，写 `\d{1,2}` 就是隐式 bug。同时「闭区间下界」会让边界值（0）误入，**业务上不该出现的值要主动用开区间或额外条件排除**

### 22. showFloat 全局监听器内存泄漏（中危，content.js）
- **现象**：SPA 反复进出发票页面（activate/deactivate），拖拽越来越卡，内存持续增长
- **根因**：`showFloat()` 每次都给 `document` 添加 `mousemove`/`mouseup` 监听器，但 `deactivate()` 只移除浮窗 DOM，**不移除监听器**。监听器随匿名闭包一直挂在 document 上，反复进出 N 次就有 N 组监听器同时触发
- **解法**：监听器提升为模块级变量 `_floatMoveHandler` / `_floatUpHandler`，`deactivate()` 调用 `removeFloatListeners()` 显式移除
- **教训**：**凡是给 `document`/`window` 这类长寿对象加的监听器，必须有配对的 removeEventListener，且 deactivate/卸载时调用**。匿名函数监听器（`(e)=>{...}`）无法移除，必须用具名变量保存引用

### 23. /test 接口版本号漏改（中危，invoice_checker.py）
- **现象**：`/test` 返回 `2.5.0`，`/health` 和根路径返回 `2.5.12`，前端依赖 `/test` 探活时显示旧版本
- **根因**：之前升 v2.5.12 时只改了 `/health` 和根路径，漏了 `/test` 里的硬编码字符串
- **解法**：新增 `VERSION = "2.5.12"` 模块级常量，三个接口 + 启动日志全部引用常量
- **教训**：**重复出现的魔法值（版本号、端口、API key）必须定义为常量统一引用**，杜绝「改一处漏一处」。这是对第 4、5 条「版本号同步」教训的根本性预防措施

### 24. background.js 版本号未同步（低危）
- **现象**：manifest.json 是 2.5.13、content.js 是 v2.5.13，但 background.js 注释和启动日志还是 v2.5.0
- **教训**：版本升级 grep 范围必须覆盖**全部源文件**，不能只盯 content.js。第 18 条检查清单应补充：**background.js 的 console.log 启动日志**单独检查

### 25. v2.5.12-fix 验证方法论（通用经验）
本次修复采用的验证流程，建议固化为后续每次改动的标准动作：
1. **语法校验**：Python 用 `python -m py_compile`，JS 用 `node --check`，不能只靠肉眼看
2. **单元测试**：把修复的核心逻辑（正则、匹配函数）抽成独立片段用 `python -c` / `node -e` 跑边界用例
   - 税率匹配覆盖：13%/6%/9%/1.5%/3% × [百分号/纯数字/小数/省略前导零] 共 18 组
   - 税率提取覆盖：13%/0.13/0.015/0%/多税率/噪音0.5 共 6 组
3. **全文 grep 回验**：版本号、关键标识符改完后全文搜索确认无遗漏、无不一致
4. **读首尾确认**：大文件编辑后读首尾 20 行，确认未被截断/重复（呼应第 6、15 条）
- **教训**：**「改完」不等于「对」，必须用可执行的校验闭环验证**。AI 工具返回的 "success" 只代表编辑动作执行了，不代表结果正确


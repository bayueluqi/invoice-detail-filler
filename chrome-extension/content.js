// 发票类型检查助手 v3.0.39
// 日期: 2026-06-29  制作人: 陆琦
// v3.0.32 改动: 修复"取消关闭后重新打开触发识别"BUG — 引入 drawOpenTime/fileCaptureTime 时间戳确保仅当前会话上传的文件才触发，增强 Drawer 关闭检测（可见性而非 DOM 移除）
// v3.0.31 改动: 修复"取消"关闭抽屉后重新触发 doCheck — 新增 lastCompletedFile，MutationObserver type-change 路径中若文件已完成检查且 capturedFile 已清空则跳过
// v3.0.30 改动: 新增 isInvoiceDrawer() + INVOICE_DRAWER_TITLE_WHITELIST，付款申请页面 Drawer 内上传附件时额外校验标题白名单，"新增应付款项"等非发票 Drawer 不再触发识别
// v3.0.27 改动: showDetailLoading 改为居中模态弹窗 + 动态进度条动画，识别完成时进度100%后淡出
// v3.0.24 改动: findDetailDialog/findDetailDialogQuick 标题匹配新增"新增应付发票"（"我的发票→新增应付发票"抽屉标题不匹配原有三种标题导致弹窗检测失败）
// v3.0.23 改动: onClickAddDetail 弹窗未找到时新增页面级表格检测 — findDetailTableOnPage 通过"序号"列定位页面固定位置的明细表格，checkDetailTableHasData 通过序号列单元格数字判断是否已有数据
// v3.0.22 改动: onClickAddDetail 明细行检测扩展6种选择器 + 详细诊断日志（定位实际DOM结构不匹配的问题）
// v3.0.21 改动: 金额填写后模拟金额字段 focus+blur 触发中台系统联动计算
// v3.0.20 改动: 新增明细逻辑重构 — 移除 hasFilledFirstDetail 标志位，改为每次点击"新增明细"时实时检查弹窗内是否已有数据行
// v3.0.19 改动: 金额填写后模拟税额字段 focus+blur 触发系统自动计算
// v3.0.18 改动: 修复数电票购买方和发票号不自动填写（移除 doCheck 中硬编码的 detected_type==='专票'||'普票' 限制）
// v3.0.17 改动: 付款申请页面（录入新发票）增加购买方校验 — 对比发票购买方与页面锁定的购买方，弹窗提示一致/不一致
// v3.0.16 改动: 明细全删光后再次新增视为第一条（onDetailDelete点击监听 + MutationObserver行数追踪）；setInputValue 改写为三策略（ElInput Vue组件直接设值 → __vue__遍历 → DOM回退）
// v3.0.15 改动: 修复 setInputValue Vue 2 兼容性问题（mount 覆盖原生 value）；InputEvent+原生setter+二次forceSet
// v3.0.14 改动: 明细仅第一条自动识别填写金额/税率/税额，第二条起跳过（含删除后重新新增）
// v3.0.5 改动: 专票税率/税额填写重构 — 单税率/多税率相同→填税率不填税额；下拉无匹配或多税率不同→回退填税额
// v3.0.9 改动: 全局移除 chcp 65001（ANSI/UTF-8 编码冲突导致中文乱码+假命令），tryFillDetail 增加明细弹窗字段校验
// v3.0.4 改动: 专票不再自动填税额（AI识别税率金额容易出错），只填税率交由系统自动计算
// v3.0.3 改动:
//   - 后端金额提取策略0升级：先定位"价税合计"标签，再在300字符窗口内搜"（小写）¥"（允许跨行空白）
//   - 后端金额提取策略1升级：窗口内取所有¥金额的最大值（价税合计≥不含税金额，避免误取明细行金额）
// v3.0.2 改动:
//   - 付款申请页面附件不触发识别: onFileChange/onFileDrop 中检查 .el-drawer，非 Drawer 内上传直接跳过
//   - Drawer 关闭防重复识别: MutationObserver 检测 Drawer DOM 消失时清理文件状态，避免取消/确定后误触发
//   - 税率异常检测: 0 < rateNum < 0.5 视为小数点错位（如 0.009%），跳过自动选择并提示用户手动选
// v3.0.0 改动:
//   1. 新增付款申请入口 /addFinancialdetail 支持
//      - isInvoicePage() 增加 /addFinancialdetail 路径匹配
//      - 新增 isPaymentApplicationPage() 函数判断是否为付款申请场景
//   2. 付款申请页面禁止自动填写购买方（重要安全保护）
//      - 付款申请的"录入新发票"中，购买方字段已被系统锁死，与付款申请单的付款单位绑定
//      - doCheck() 中增加场景判断：付款申请页面跳过 tryFillBuyer()
//      - 原因：自动修改购买方会导致与付款申请单不一致，造成数据错乱
//   3. background.js INVOICE_PATTERN 同步扩展，确保 SPA 导航时 extension 正常激活
// v2.5.29 改动:
//   1. 修复专票税额(tax_amount)不自动填入表单的致命缺陷
//      - 根因: tryFillDetail的专票处理逻辑将"税额填写"嵌套在"税率分支"内部
//            当tax_rate=null(如多税率电子专票)时,代码走入else分支:
//              filledItems.push('⚠ 税率未识别') → 直接结束
//            tax_amount即使有值(如59.05)也永远不会被填入表单!
//      - 修复: 将税率处理和税额填充分离为两步:
//        Step1(税率): 只操作下拉框选择,根据情况提示
//        Step2(税额): 无条件执行,有值就填,独立于任何税率分支
//      - 效果: 无论税率是否识别到,只要有税额值就会自动填写+弹窗展示
//   2. 弹窗确认窗新增税额信息显示
//      - 之前弹窗只显示金额+税率状态,用户看不到税额无法复核
//      - v2.5.29: filledItems始终包含税额项(有值显示值,无值显示警告)
// v2.5.23 改动:
//   1. 两阶段业务流程:
//      - 阶段1(上传发票): AI识别 → 只展示发票号+购买方确认弹窗, 不自动点"新增明细"
//      - 阶段2(手动点"新增明细"): 才触发金额/税率/税额自动填写(tryFillDetail)
//   2. 去掉doCheck中的canAutoDetail+clickAddDetailButton+pendingFillResults逻辑
//   3. 新增lastCheckResultData缓存完整AI结果供阶段2使用
//   4. 专票填金额+税率+税额 / 普票及其他只填金额 (tryFillDetail已有此逻辑)
// v2.5.20 改动 (保留):
//   1. 修复弹窗金额不填入（根本修复）：
//      - findDetailDialog 重构：收集所有匹配弹窗，优先返回含可编辑input的（系统存在多个同名drawer，第一个是只读的）
//      - 标题匹配新增「新增编辑项」
//   2. setInputValue 重构：总是立即原生设值，Vue $emit 仅作补充；增加300ms验证+重试
// v2.5.18 改动 (保留):
//   1. 天气接口支持Windows系统代理（公司网络自动检测代理）
//   2. 天气获取增加国内API备用（心知天气），外网不通时自动切换
//   3. 天气加载超时5秒后显示"天气信息暂不可用"，不再永远卡"加载中"
// v2.5.13 改动 (保留):
//   1. doCheck 填完发票号+购买方后，自动点击"新增明细"按钮，触发金额+税率自动填写
//   2. 主表结果暂存到 pendingFillResults，与明细结果合并后统一弹窗，不再分两次弹
//   3. 找不到"新增明细"按钮时退回原弹窗逻辑
// v2.5.12 改动 (保留):
//   1. bat 文件彻底全英文（CMD GBK 解析兼容），修复 v2.5.11 因 bat 中文导致 Python 服务无法启动的严重问题
//   2. 举一反三：所有 4 个文件均无 Unicode 转义码，所有中文字符均为正常 UTF-8 字符
// v2.5.11 改动 (保留):
//   1. 修复 doCheck 与 tryFillDetail 两个弹窗重叠：doCheck 完成后延迟 800ms 检查 tryFillDetail 是否在跑，
//      是则把发票号/购买方暂存到 pendingFillResults，等 tryFillDetail 完成后合并弹窗
//   2. tryFillDetail 完成后弹窗时把 pendingFillResults 一起显示并清空暂存
// v2.5.10 改动:
//   1. 新增明细自动填写：移除hasUploadedFile()运行时检查，仅用lastCapturedFile判断，防止drawer动画期间误判
//   2. findDetailDialog增强：兼容更多drawer标题DOM结构，兜底用"蓝票金额"字段定位
//   3. AI识别结果弹窗统一：发票号+购买方合并一个弹窗提示，不再分开toast
//   4. tryFillBuyer改为返回结果字符串，由doCheck统一收集展示
//   5. doCheck改为async，await tryFillBuyer确保结果完整后再弹窗
// 保留 v2.4.7 全部原有功能

const PS = 'http://127.0.0.1:52100/check-invoice';
const PS_DETAIL = 'http://127.0.0.1:52100/extract-detail';
let isActive = false;
let capturedFile = null;
let currentInvoiceType = null;
let lastCapturedFile = null;
let lastCheckedType = null;
let checkInProgress = false;
let lastCheckResult = null;
let observer = null;
let checkSeq = 0;
let autoFilledNumber = null;
let autoFilledBuyer = null;
let detailFillInProgress = false;
let detailDialogFilled = false;
let pendingFillResults = [];
// v2.5.21: 标志位 — 用户已手动打开明细弹窗，doCheck完成后禁止再点"新增明细"按钮
let userManuallyOpenedDetail = false;
// v2.5.22: 缓存AI完整识别结果，供用户手动打开明细弹窗时使用（两阶段流程）
let lastCheckResultData = null;
// v3.0.13: 防止 doCheck 被短时间内重复调用（MutationObserver/onClickRadio 可能二次触发）
let lastCheckTimestamp = 0;
const CHECK_DEBOUNCE_MS = 2000; // 同一文件2秒内不重复检查
let lastCompletedFile = null; // v3.0.31: 记录最近一次完成检查的文件名，防止MutationObserver二次触发

// v3.0.32: 时间戳追踪 — 确保只有当前 Drawer 会话中上传的文件才触发识别
// 场景：关闭 Drawer 后重新打开，DOM/文件列表残留，但用户尚未上传新文件 → 不应触发识别
let drawOpenTime = 0;       // Drawer 最后一次从"不可见→可见"的时间戳
let fileCaptureTime = 0;    // 最后一次成功捕获文件的时间戳
let drawCloseTime = 0;      // Drawer 最后一次从"可见→不可见"的时间戳

// v3.0.28: 浮窗功能开关（默认全部开启）
let icToggleBuyer = true;    // 发票号+购买方识别开关
let icToggleAmount = true;   // 发票金额+税率识别开关
let icToggleVerify = false;  // v3.0.36: 提交再检查开关（关闭=即时识别模式，开启=延迟到点确定时校验）

// v3.0.36: 提交再检查 — 后台校验队列状态
const verifyQueue = [];        // 待校验任务队列 [{id, fileName, fileData, formData, status}]
let verifyingCount = 0;       // 正在校验中的数量
let verifiedTotal = 0;        // 已完成校验总数
let verifyReports = {};       // 已完成的报告 {taskId: {text, timestamp}}
// v3.0.20: 移除 hasFilledFirstDetail，改为每次新增明细时实时检查弹窗内是否已有数据行

// ====== v2.5.14: 天气 + 励志短句 ======
let weatherCache = { data: null, timestamp: 0 };
const WEATHER_CACHE_MS = 30 * 60 * 1000;

const QUOTES = [
  '把每一件简单的事做好就是不简单，把每一件平凡的事做好就是不平凡。',
  '星光不问赶路人，时光不负有心人。',
  '每一个不曾起舞的日子，都是对生命的辜负。',
  '你现在的努力，是为了未来的你有更多选择。',
  '成功不是将来才有的，而是从决定去做的那一刻起。',
  '不要等待机会，而要创造机会。',
  '所有的努力不会完全白费，你付出多少时间和精力，都是在对未来的积累。',
  '世上没有绝望的处境，只有对处境绝望的人。',
  '生活不是等待暴风雨过去，而是学会在雨中翩翩起舞。',
  '你的时间有限，不要为别人而活。',
  '与其用泪水悔恨昨天，不如用汗水拼搏今天。',
  '梦想不会逃跑，会逃跑的永远是自己。',
  '最暗的夜才能看见最美的星光，人生亦是如此。',
  '不怕路远，就怕志短；不怕缓慢，就怕常站。',
  '当你觉得坚持不下去的时候，恰恰是你需要坚持下去的时候。',
  '没有人可以回到过去重新开始，但每个人都可以从现在开始创造一个全新的结局。',
  '只要路是对的，就不怕路远。',
  '努力的意义就是：以后的日子里，放眼望去全都是自己喜欢的东西。',
  '不要因为走得太远，忘了我们为什么出发。',
  '当你穿过了暴风雨，你已不再是从前那个人。'
];

function randomQuote() {
  return QUOTES[Math.floor(Math.random() * QUOTES.length)];
}

function fetchWeather() {
  const now = Date.now();
  if (weatherCache.data && (now - weatherCache.timestamp) < WEATHER_CACHE_MS) {
    updateLoadingWeather();
    return;
  }
  // 5 second timeout: if weather not loaded, show fallback
  const weatherTimer = setTimeout(() => {
    const el = document.getElementById('ic-loading');
    if (!el) return;
    const slot = el.shadowRoot && el.shadowRoot.getElementById('weather-slot');
    if (slot && !(weatherCache.data && weatherCache.data.weather)) {
      slot.innerHTML = '<span class="weather-icon">\u{1F324}</span>' +
        '<div class="weather-detail"><span class="weather-city" style="color:#909399">\u2601\uFE0F \u5929\u6C14\u4FE1\u606F\u6682\u4E0D\u53EF\u7528</span><span class="weather-desc">&nbsp;</span></div>';
    }
  }, 5000);

  fetch('http://127.0.0.1:52100/weather')
    .then(r => r.json())
    .then(data => {
      clearTimeout(weatherTimer);
      if (!data.error) {
        weatherCache = { data, timestamp: Date.now() };
        console.log('[发票检查 v2.5] 天气已缓存:', data.city, data.weather);
        updateLoadingWeather();
      }
    })
    .catch(() => {
      clearTimeout(weatherTimer);
      console.log('[发票检查 v2.5] 天气获取失败，不影响使用');
      // Show fallback immediately on error
      const el = document.getElementById('ic-loading');
      if (!el) return;
      const slot = el.shadowRoot && el.shadowRoot.getElementById('weather-slot');
      if (slot && !(weatherCache.data && weatherCache.data.weather)) {
        slot.innerHTML = '<span class="weather-icon">\u{1F324}</span>' +
          '<div class="weather-detail"><span class="weather-city" style="color:#909399">\u2601\uFE0F \u5929\u6C14\u4FE1\u606F\u6682\u4E0D\u53EF\u7528</span><span class="weather-desc">&nbsp;</span></div>';
      }
    });
}

function updateLoadingWeather() {
  const el = document.getElementById('ic-loading');
  if (!el) return;
  const w = weatherCache.data;
  const slot = el.shadowRoot && el.shadowRoot.getElementById('weather-slot');
  if (!slot || !w || !w.city) return;
  slot.innerHTML = '<span class="weather-icon">' + (w.icon || '\u{1F324}') + '</span>' +
    '<div class="weather-detail"><span class="weather-city">' + w.city + ' \u00B7 ' + (w.weather || '') + '</span>' +
    '<span class="weather-desc">' + (w.temp || '') + ' / ' + (w.humidity || '') + ' / ' + (w.wind || '') + '</span></div>';
}

let SAVED_BUYERS = [
  '上海优通云仓供应链管理有限公司',
  '上海优通国际物流有限公司',
  '上海万顺供应链管理有限公司',
  '上海威廉达通物流科技有限公司',
  '上海诸将企业管理合伙企业',
  '芜湖一众仁企业管理服务有限公司',
  '上海优力达供应链管理有限公司',
  '扬州优通物流科技有限公司',
  '上海优通物流科技有限公司',
  '广州优通国际物流有限公司',
  '苏州扬腾国际物流有限公司',
  '上海优嘉云物流有限公司',
  '上海优宇泰供应链管理有限公司',
  '金华优通物流科技有限公司',
  '山鹰绿能(上海)工业技术有限公司',
  '四川省优递康供应链科技有限公司',
  '上海合链智达供应链合伙企业(有限合伙)',
  '芜湖一众仁企业管理服务有限公司金华分公司',
  '上海优通供应链管理有限公司',
  '上海益汇供应链管理有限公司',
  '无锡扬腾供应链管理有限公司',
  '重庆优通物流科技有限公司',
  '上海扬腾供应链管理有限公司'
];

function isInvoicePage() {
  return location.pathname.includes('/financial/invoice/detail') ||
         location.pathname.includes('/financial/invoice/add') ||
         location.pathname.includes('/addFinancialdetail') ||
         location.pathname.includes('/myInvoice/detail');
}

// v3.0.0: 判断是否为付款申请页面（/addFinancialdetail）
// 该场景下购买方由系统锁定，与付款申请单的付款单位绑定，禁止自动修改
function isPaymentApplicationPage() {
  return location.pathname.includes('/addFinancialdetail');
}

// v3.0.30: 判断触发上传的元素所在的 Drawer/Dialog 是否是"发票相关"
// 白名单：录入发票 / 新增明细 / 新增应付发票 / 新增应付费 / 新增编辑项
// 不在白名单内（如"新增应付款项"、"应付款项报告"等）→ 不应触发发票识别
const INVOICE_DRAWER_TITLE_WHITELIST = ['录入发票', '新增明细', '新增应付发票', '新增应付费', '新增编辑项'];

function isInvoiceDrawer(el) {
  // 从触发元素向上找最近的 Drawer 或 Dialog
  const container = el ? el.closest('.el-drawer, .el-dialog') : null;
  if (!container) {
    // 找不到容器 → 不在任何 Drawer/Dialog 内，说明是主页面上传，不匹配
    return false;
  }
  // 获取 Drawer/Dialog 的标题文字
  const titleEl = container.querySelector('.el-drawer__title, .el-drawer__header, .el-dialog__title, .el-dialog__header');
  const titleText = titleEl ? (titleEl.innerText || titleEl.textContent || '').trim() : '';
  console.log('[发票检查 v3.0.30] isInvoiceDrawer 检测到容器标题:', titleText);
  // 标题包含白名单任意关键词 → 是发票相关 Drawer
  return INVOICE_DRAWER_TITLE_WHITELIST.some(kw => titleText.includes(kw));
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ====== 检查页面上是否真的有附件 ======
function hasUploadedFile() {
  const elList = document.querySelectorAll('.el-upload-list .el-upload-list__item, .el-upload-list__item');
  if (elList.length > 0) return true;
  const antList = document.querySelectorAll('.ant-upload-list-item, .ant-upload-list-item-container, .ant-upload-list-text-container');
  if (antList.length > 0) return true;
  const fileInputs = document.querySelectorAll('input[type="file"]');
  for (const input of fileInputs) {
    if (input.files && input.files.length > 0) return true;
  }
  return false;
}

// v3.0.32: 计数可见 Drawer（排除 display:none 的隐藏 wrapper）
// Element UI Drawer 关闭时 DOM 不会被移除，仅 wrapper 设置 display:none
function countVisibleDrawers() {
  const wrappers = document.querySelectorAll('.el-drawer__wrapper');
  let count = 0;
  for (const w of wrappers) {
    const style = window.getComputedStyle(w);
    if (style.display !== 'none' && style.visibility !== 'hidden') {
      count++;
    }
  }
  return count;
}

// ====== 从 background 拉取 SAVED_BUYERS ======
function initBuyers() {
  console.log('[发票检查 v2.5] 使用硬编码默认 SAVED_BUYERS:', SAVED_BUYERS.length, '家');
  if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) return;
  try {
    chrome.runtime.sendMessage({ action: 'get_buyers' }, (resp) => {
      if (chrome.runtime.lastError) return;
      if (resp && resp.ok && Array.isArray(resp.buyers) && resp.buyers.length > 0) {
        SAVED_BUYERS = resp.buyers;
        console.log('[发票检查 v2.5] 已从 background 更新 SAVED_BUYERS:', SAVED_BUYERS.length, '家');
      }
    });
  } catch (e) {}
}

// ====== 找"购买方"字段的 form-item ======
function findBuyerFormItem() {
  const labels = document.querySelectorAll('.el-form-item__label, label, .ant-form-item-label, th, .form-item-label, .ant-form-item-required');
  for (const label of labels) {
    const text = (label.textContent || '').trim();
    if (text === '购买方' || text === '购方') {
      const formItem = label.closest('.el-form-item, .ant-form-item, tr, .form-group, .form-item');
      if (formItem) {
        const hasSelect = formItem.querySelector('.el-select, .ant-select');
        if (hasSelect) return formItem;
      }
    }
  }
  return null;
}

function openDropdown(selectEl) {
  const elInput = selectEl.querySelector('.el-input__inner');
  if (elInput) { elInput.click(); return true; }
  const antSelector = selectEl.querySelector('.ant-select-selector');
  if (antSelector) { antSelector.click(); return true; }
  return false;
}

function readDropdownOptions() {
  const options = [];
  const elItems = document.querySelectorAll('.el-select-dropdown__item:not(.is-disabled)');
  elItems.forEach(item => {
    const text = (item.textContent || '').trim();
    if (text) options.push({ text, element: item, source: 'el' });
  });
  const antItems = document.querySelectorAll('.ant-select-item-option:not(.ant-select-item-option-disabled)');
  antItems.forEach(item => {
    const text = (item.textContent || '').trim();
    if (text) options.push({ text, element: item, source: 'ant' });
  });
  return options;
}

/**
 * 关闭下拉框 - v2.5.25: 严禁使用任何会冒泡的全局事件！
 * 历史踩坑记录:
 *   v2.5.23及之前: document.body.click() → 触发 Element UI drawer 遮罩层点击 → drawer关闭
 *   v2.5.24: 改用 document.dispatchEvent(ESC) → Element UI drawer 监听ESC也会关闭 → drawer还是关闭!
 *
 * 安全做法: 只直接操作 dropdown DOM 元素进行隐藏,不发送任何全局事件
 */
function closeDropdown() {
  // 方式1: 直接隐藏所有可见的 el-select-dropdown 浮层
  const dropdowns = document.querySelectorAll('.el-select-dropdown.el-popper');
  for (const dd of dropdowns) {
    if (dd.style.display !== 'none' || dd.offsetParent !== null) {
      dd.style.display = 'none';
    }
  }
  // 方式2: 也检查 ant-design 的下拉浮层
  const antDropdowns = document.querySelectorAll('.ant-select-dropdown, .ant-dropdown');
  for (const dd of antDropdowns) {
    if (dd.style.display !== 'none' || dd.offsetParent !== null) {
      dd.style.display = 'none';
    }
  }
}

function selectOption(optionEl) {
  if (!optionEl) return;
  optionEl.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window, button: 0 }));
  optionEl.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window, button: 0 }));
  optionEl.click();
  optionEl.dispatchEvent(new Event('click', { bubbles: true }));
}

function lcsSimilarity(a, b) {
  if (!a || !b) return 0;
  const m = a.length, n = b.length;
  if (m === 0 || n === 0) return 0;
  const [short, long] = m < n ? [a, b] : [b, a];
  const sl = short.length, ll = long.length;
  let prev = new Array(sl + 1).fill(0);
  let curr = new Array(sl + 1).fill(0);
  let maxLen = 0;
  for (let i = 1; i <= ll; i++) {
    for (let j = 1; j <= sl; j++) {
      if (long[i-1] === short[j-1]) {
        curr[j] = prev[j-1] + 1;
        if (curr[j] > maxLen) maxLen = curr[j];
      } else {
        curr[j] = 0;
      }
    }
    [prev, curr] = [curr, prev];
  }
  return maxLen / Math.max(m, n);
}

function matchBuyer(buyerName, options) {
  if (!buyerName || !options || options.length === 0) return { matched: null, method: null };
  for (const saved of SAVED_BUYERS) {
    if (saved === buyerName) {
      const exactOption = options.find(opt => opt.text === saved);
      if (exactOption) return { matched: exactOption, method: 'precise' };
    }
  }
  let bestSaved = null, bestSavedScore = 0;
  for (const saved of SAVED_BUYERS) {
    const score = lcsSimilarity(buyerName, saved);
    if (score > bestSavedScore) { bestSavedScore = score; bestSaved = saved; }
  }
  if (bestSavedScore >= 0.5 && bestSaved) {
    const fuzzyOption = options.find(opt => opt.text === bestSaved) ||
                        options.find(opt => lcsSimilarity(bestSaved, opt.text) >= 0.5);
    if (fuzzyOption) return { matched: fuzzyOption, method: 'fuzzy_saved', saved: bestSaved, score: bestSavedScore };
  }
  let bestOpt = null, bestOptScore = 0;
  for (const opt of options) {
    const score = lcsSimilarity(buyerName, opt.text);
    if (score > bestOptScore) { bestOptScore = score; bestOpt = opt; }
  }
  if (bestOptScore >= 0.5) return { matched: bestOpt, method: 'fuzzy_dropdown', score: bestOptScore };
  return { matched: null, method: 'not_found' };
}

/**
 * v3.0.17: 付款申请页面购买方校验
 * 该页面购买方字段被系统锁死（disabled/readonly），不自动填写，
 * 但需校验发票上的购买方与页面显示的是否一致
 * @returns {string|null} 校验结果字符串，无法校验时返回 null
 */
function verifyPageBuyer(invoiceBuyer) {
  if (!invoiceBuyer || invoiceBuyer === '未识别') return null;

  const formItem = findBuyerFormItem();
  if (!formItem) {
    console.log('[发票检查 v3.0] verifyPageBuyer: 未找到购买方表单项');
    return null;
  }

  // 读取页面锁定购买方的显示值
  // Element UI 的 disabled select 下，值在 .el-input__inner 或占位文本
  let pageBuyer = '';
  const valueEl = formItem.querySelector('.el-select .el-input__inner, .el-input.is-disabled .el-input__inner, .ant-select-selection-item');
  if (valueEl) {
    pageBuyer = (valueEl.value || valueEl.getAttribute('placeholder') || valueEl.textContent || '').trim();
  }
  // 回退：直接读 form-item 内可见文本
  if (!pageBuyer) {
    const textNodes = formItem.querySelectorAll('.el-input__inner, .el-tag, .ant-select-selection-item, span');
    for (const node of textNodes) {
      const t = (node.textContent || '').trim();
      if (t && t.length >= 4 && !t.includes('购买方') && !t.includes('请选择')) {
        pageBuyer = t;
        break;
      }
    }
  }

  if (!pageBuyer) {
    console.log('[发票检查 v3.0] verifyPageBuyer: 无法读取页面购买方');
    return null;
  }

  console.log('[发票检查 v3.0] 购买方校验: 发票=' + invoiceBuyer + ' vs 页面=' + pageBuyer);

  // 相似度比较（发票购买方可能含简称/括号，页面购买方是全称）
  const simScore = lcsSimilarity(invoiceBuyer, pageBuyer);
  if (simScore >= 0.6 || pageBuyer.includes(invoiceBuyer) || invoiceBuyer.includes(pageBuyer)) {
    return '✅ 购买方校验通过: 发票与页面一致（' + pageBuyer + '）';
  } else {
    return '⚠️ 购买方不一致！发票购买方: ' + invoiceBuyer + '，页面购买方: ' + pageBuyer;
  }
}

/**
 * v2.5.10: tryFillBuyer 返回结果字符串，不再单独弹toast
 * 返回格式: "购买方: xxx" 或 "⚠️ 购买方xxx未匹配到，请手动选择"
 */
async function tryFillBuyer(buyerName, detectedType) {
  if (!buyerName || buyerName === '未识别' || detectedType === '其他') return null;
  if (!icToggleBuyer) { console.log('[发票检查 v3.0] 购买方识别已关闭，跳过'); return null; }
  if (SAVED_BUYERS.length === 0) return null;
  if (autoFilledBuyer === buyerName) return null;
  console.log('[发票检查 v2.5] 开始购买方匹配:', buyerName);
  const formItem = findBuyerFormItem();
  if (!formItem) return null;
  const selectEl = formItem.querySelector('.el-select, .ant-select');
  if (!selectEl) return null;
  if (!openDropdown(selectEl)) return null;
  await sleep(500);
  const options = readDropdownOptions();
  if (options.length === 0) { closeDropdown(); return null; }
  const result = matchBuyer(buyerName, options);
  if (result.matched) {
    selectOption(result.matched.element);
    await sleep(200);
    autoFilledBuyer = buyerName;
    const suffix = (result.method === 'fuzzy_saved' || result.method === 'fuzzy_dropdown') ? '（智能匹配）' : '';
    try { chrome.runtime.sendMessage({ action: 'fill_buyer_result', buyerName, matchedName: result.matched.text, method: result.method }).catch(() => {}); } catch (e) {}
    return '购买方: ' + result.matched.text + suffix;
  } else {
    closeDropdown();
    selectEl.style.border = '2px solid #f56c6c';
    selectEl.style.boxShadow = '0 0 4px rgba(245,108,108,0.4)';
    setTimeout(() => { selectEl.style.border = ''; selectEl.style.boxShadow = ''; }, 5000);
    try { chrome.runtime.sendMessage({ action: 'fill_buyer_result', buyerName, matchedName: null, method: 'not_found' }).catch(() => {}); } catch (e) {}
    return '⚠️ 购买方"' + buyerName + '"未匹配到，请手动选择';
  }
}

// ====== 激活 ======
function activate() {
  if (isActive) return;
  isActive = true;
  console.log('[发票检查 v2.5] 激活发票检查功能');

  observer = new MutationObserver(() => {
    // v3.0.32: 使用可见 Drawer 计数（非 display:none）替代旧的 DOM 元素计数
    // Element UI Drawer 关闭时 DOM 不会被移除，仅 wrapper 设置 display:none
    const visibleDrawers = countVisibleDrawers();
    
    // v3.0.32: Drawer 从可见→不可见（关闭），彻底清理所有状态
    if (observer._hadVisibleDrawer && visibleDrawers === 0) {
      console.log('[发票检查 v3.0.32] Drawer已关闭（可见数量→0），清理全部文件状态');
      drawCloseTime = Date.now();
      capturedFile = null;
      lastCapturedFile = null;
      lastCompletedFile = null;
      lastCheckedType = null;
      autoFilledNumber = null;
      autoFilledBuyer = null;
      checkInProgress = false;
      lastCheckTimestamp = 0;
      hideLoading();
      observer._hadVisibleDrawer = false;
      return;
    }
    
    // v3.0.32: Drawer 从不可见→可见（打开），记录时间戳
    if (!observer._hadVisibleDrawer && visibleDrawers > 0) {
      drawOpenTime = Date.now();
      console.log('[发票检查 v3.0.32] Drawer已打开 (时间戳=' + drawOpenTime + ')，当前lastCapturedFile=' + (lastCapturedFile ? lastCapturedFile.fileName : 'null'));
      // v3.0.32: 安全网 — 如果 Drawer 打开时 lastCapturedFile 存在但未检测到新文件上传
      // （即 lastCapturedFile 是上次 Drawer 会话残留的），清理它
      if (lastCapturedFile && fileCaptureTime < drawOpenTime && !hasUploadedFile()) {
        console.log('[发票检查 v3.0.32] lastCapturedFile 是上次会话残留且当前无附件，清理状态');
        lastCapturedFile = null;
        lastCompletedFile = null;
        lastCheckedType = null;
        capturedFile = null;
        autoFilledNumber = null;
        autoFilledBuyer = null;
      }
    }
    observer._hadVisibleDrawer = visibleDrawers > 0;

    if (lastCapturedFile && !hasUploadedFile()) {
      // v2.5.9: 正在填明细时不重置
      if (detailFillInProgress) {
        console.log('[发票检查 v2.5] 明细填写中，跳过lastCapturedFile重置');
      } else {
        // 延迟确认：附件列表可能因DOM重绘临时消失，等300ms再确认
        if (!observer._pendingReset) {
          observer._pendingReset = setTimeout(() => {
            if (lastCapturedFile && !hasUploadedFile() && !detailFillInProgress) {
              console.log('[发票检查 v2.5] 确认附件已清空，重置 lastCapturedFile');
              capturedFile = null;
              lastCapturedFile = null;
              autoFilledNumber = null;
              autoFilledBuyer = null;
              hideLoading();
            }
            observer._pendingReset = null;
          }, 300);
        }
        return;
      }
    } else if (observer._pendingReset) {
      clearTimeout(observer._pendingReset);
      observer._pendingReset = null;
    }
    if (checkInProgress) return;
    const newType = readInvoiceType();
    if (newType && newType !== lastCheckedType && lastCapturedFile && hasUploadedFile()) {
      // v3.0.32: 时间戳保护 — 仅当前 Drawer 会话中上传的文件才触发识别
      if (fileCaptureTime < drawOpenTime) {
        console.log('[发票检查 v3.0.32] 文件是上次Drawer会话残留(fileCaptureTime=' + fileCaptureTime + ' < drawOpenTime=' + drawOpenTime + ')，仅更新类型，跳过doCheck');
        lastCheckedType = newType;
      }
      // v3.0.31: 防止已完成的检查被 MutationObserver 二次触发
      else if (lastCompletedFile === lastCapturedFile.fileName && !capturedFile) {
        console.log('[发票检查 v3.0.31] 文件已完成检查且capturedFile已清空，仅更新lastCheckedType，跳过doCheck');
        lastCheckedType = newType;
      } else {
        console.log('[发票检查] DOM变化检测到类型变更:', lastCheckedType, '->', newType);
        lastCheckedType = newType;
        capturedFile = { fileName: lastCapturedFile.fileName, fileData: lastCapturedFile.fileData };
        doCheck();
      }
    } else if (newType) {
      lastCheckedType = newType;
    }

    // v3.0.13: 检测"新增明细"弹窗消失 → 重置明细填写状态（支持同一张票多次点明细）
    const hadDetailDialog = observer._hadDetailDialog;
    const hasDetailDialogNow = !!findDetailDialogQuick();
    observer._hadDetailDialog = hasDetailDialogNow;
    if (hadDetailDialog && !hasDetailDialogNow && detailDialogFilled) {
      console.log('[发票检查 v3.0] 明细弹窗已关闭，重置detailDialogFilled允许再次填写');
      detailDialogFilled = false;
      userManuallyOpenedDetail = false;
      detectDetailDialog._lastFire = 0;
    }

    // v3.0.20: 明细表行数追踪仅用于 onDetailDelete 需要时参考，不再维护全局标志位
    const detailRows = document.querySelectorAll('.el-table__body-wrapper tbody tr, .el-table__body tbody tr');
    observer._detailRowCount = Array.from(detailRows).filter(r => {
      const t = (r.textContent || '').trim();
      return t && t !== '暂无数据';
    }).length;

    detectDetailDialog();
  });
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'value'] });

  document.addEventListener('click', onClickRadio, true);
  document.addEventListener('change', onFileChange, true);
  document.addEventListener('drop', onFileDrop, true);
  document.addEventListener('click', onClickAddDetail, true);
  document.addEventListener('click', onDetailDelete, true);  // v3.0.15: 监听明细删除，删光后重置首条标志
  showFloat();
  initBuyers();
}

// ====== 停用 ======
function deactivate() {
  if (!isActive) return;
  isActive = false;
  console.log('[发票检查] 离开发票页面，停用检查功能');
  if (observer) { observer.disconnect(); observer = null; }
  document.removeEventListener('click', onClickRadio, true);
  document.removeEventListener('change', onFileChange, true);
  document.removeEventListener('drop', onFileDrop, true);
  document.removeEventListener('click', onClickAddDetail, true);
  document.removeEventListener('click', onDetailDelete, true);
  const fw = document.getElementById('ic-float');
  if (fw) fw.remove();
  removeFloatListeners();  // v2.5.14-fix: 移除拖拽监听器
  const ld = document.getElementById('ic-loading');
  if (ld) ld.remove();
  capturedFile = null;
  lastCapturedFile = null;
  lastCheckedType = null;
  checkInProgress = false;
  lastCheckResult = null;
  autoFilledNumber = null;
  autoFilledBuyer = null;
  detailFillInProgress = false;
  userManuallyOpenedDetail = false;
  lastCheckResultData = null;  // v2.5.21: 离开页面时重置
}

// ====== 1. 读取发票类型 ======
function readInvoiceType() {
  const allLabels = document.querySelectorAll('.el-form-item__label, label, .ant-form-item-label, th');
  for (const label of allLabels) {
    const text = (label.textContent || '').trim();
    if (text.includes('发票类型') || text === '类型') {
      const formItem = label.closest('.el-form-item, .ant-form-item, tr, .form-group');
      if (formItem) {
        const radioGroup = formItem.querySelector('.el-radio-group');
        if (radioGroup) {
          const activeBtn = radioGroup.querySelector('.el-radio-button.is-active');
          if (activeBtn) {
            const inner = activeBtn.querySelector('.el-radio-button__inner');
            if (inner) {
              const val = inner.textContent.trim();
              if (['普票', '专票', '其他'].includes(val)) { currentInvoiceType = val; return val; }
            }
          }
          const checkedRadio = radioGroup.querySelector('.el-radio.is-checked .el-radio__label, .el-radio.is-checked');
          if (checkedRadio) {
            const val = (checkedRadio.textContent || '').trim();
            if (['普票', '专票', '其他'].includes(val)) { currentInvoiceType = val; return val; }
          }
        }
        const selectVal = formItem.querySelector('.el-select .el-input__inner, .ant-select-selection-item, select');
        if (selectVal) {
          const val = (selectVal.textContent || selectVal.value || '').trim();
          if (val && val !== '请选择' && val !== '' && !/^\d+$/.test(val)) { currentInvoiceType = val; return val; }
        }
      }
    }
  }
  const radioBtns = document.querySelectorAll('.el-radio-button');
  for (const btn of radioBtns) {
    if (btn.classList.contains('is-active')) {
      const inner = btn.querySelector('.el-radio-button__inner');
      if (inner) {
        const val = inner.textContent.trim();
        if (['普票', '专票', '其他'].includes(val)) { currentInvoiceType = val; return val; }
      }
    }
  }
  const allEls = document.querySelectorAll('span, div, p, label');
  for (const el of allEls) {
    const val = (el.textContent || '').trim();
    if (['普票', '专票', '其他'].includes(val) && el.children.length === 0) {
      currentInvoiceType = val; return val;
    }
  }
  return null;
}

// ====== 点击radio处理 ======
function onClickRadio(e) {
  const radioBtn = e.target.closest('.el-radio-button, .el-radio');
  if (!radioBtn) return;
  if (radioBtn.classList.contains('is-disabled')) return;
  if (radioBtn.disabled) return;
  const parentDisabled = radioBtn.closest('.is-disabled');
  if (parentDisabled && (parentDisabled.classList.contains('el-radio-button') || parentDisabled.classList.contains('el-radio'))) return;

  // v3.0.32: 时间戳保护 — 仅当前 Drawer 会话中上传的文件才触发识别
  if (lastCapturedFile && fileCaptureTime < drawOpenTime) {
    console.log('[发票检查 v3.0.32] onClickRadio: 文件是上次Drawer会话残留(fileCapture=' + fileCaptureTime + ' < drawOpen=' + drawOpenTime + ')，跳过识别');
    // 清理残留状态
    lastCapturedFile = null;
    lastCompletedFile = null;
    lastCheckedType = null;
    capturedFile = null;
    autoFilledNumber = null;
    autoFilledBuyer = null;
    return;
  }

  if (lastCapturedFile && hasUploadedFile()) {
    lastCompletedFile = null; // v3.0.31: 用户手动切换类型，允许重新检查
    showLoading();
    blockSubmit();
    let attempts = 0;
    const maxAttempts = 10;
    const savedType = lastCheckedType;
    const pollTypeChange = () => {
      attempts++;
      const newType = readInvoiceType();
      if (newType && newType !== savedType) {
        lastCheckedType = newType;
        capturedFile = { fileName: lastCapturedFile.fileName, fileData: lastCapturedFile.fileData };
        autoFilledNumber = null;
        autoFilledBuyer = null;
        doCheck();
      } else if (attempts >= maxAttempts) {
        if (newType) lastCheckedType = newType;
        capturedFile = { fileName: lastCapturedFile.fileName, fileData: lastCapturedFile.fileData };
        autoFilledNumber = null;
        autoFilledBuyer = null;
        doCheck();
      } else {
        setTimeout(pollTypeChange, 100);
      }
    };
    setTimeout(pollTypeChange, 100);
  } else if (lastCapturedFile && !hasUploadedFile()) {
    // v3.0.32: 安全网 — lastCapturedFile 存在但无附件，清理残留状态
    console.log('[发票检查 v3.0.32] onClickRadio: lastCapturedFile 存在但无附件，清理残留状态');
    lastCapturedFile = null;
    lastCompletedFile = null;
    lastCheckedType = null;
    capturedFile = null;
    autoFilledNumber = null;
    autoFilledBuyer = null;
  }
}

// ====== 2. 捕获文件 ======
function captureFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    const arr = new Uint8Array(reader.result);
    let binary = '';
    const chunk = 8192;
    for (let i = 0; i < arr.length; i += chunk) {
      const c = arr.subarray(i, Math.min(i + chunk, arr.length));
      binary += String.fromCharCode.apply(null, c);
    }
    capturedFile = { fileName: file.name, fileData: btoa(binary) };
    lastCapturedFile = { fileName: file.name, fileData: btoa(binary) };
    lastCompletedFile = null; // v3.0.31: 新文件，重置已完成标记
    fileCaptureTime = Date.now(); // v3.0.32: 记录文件捕获时间，用于Drawer会话校验
    autoFilledNumber = null;
    autoFilledBuyer = null;
    console.log('[发票检查] 捕获文件:', file.name, Math.round(file.size / 1024) + 'KB', '(captureTime=' + fileCaptureTime + ')');
    // v3.0.36: 提交再检查模式下，仅缓存文件不触发即时识别
    // 用户填写完表单点确定后，由 hookConfirmButton 统一发送校验请求
    if (icToggleVerify) {
      console.log('[发票检查 v3.0.39] 提交再检查模式：文件已缓存，等待用户点击【确定】后校验');
      return;
    }
    doCheck();
  };
  reader.readAsArrayBuffer(file);
}

function onFileChange(e) {
  if (e.target.type === 'file') {
    // v3.0.0: 付款申请页面(/addFinancialdetail)中，仅"录入新发票"Drawer内的上传才触发识别
    // 付款申请主页面自身的附件上传（如报销凭证等）不触发发票检查
    if (isPaymentApplicationPage() && !e.target.closest('.el-drawer')) {
      console.log('[发票检查 v3.0] 付款申请页面附件上传（非Drawer内），跳过发票识别');
      return;
    }
    // v3.0.30: 付款申请页面 Drawer 内进一步校验标题白名单
    // "新增应付款项"/"应付款项报告" 等非发票 Drawer 内的上传不触发识别
    if (isPaymentApplicationPage() && e.target.closest('.el-drawer') && !isInvoiceDrawer(e.target)) {
      console.log('[发票检查 v3.0.30] 付款申请页面非发票Drawer内附件上传，跳过发票识别');
      return;
    }
    if (e.target.files && e.target.files.length > 0) {
      captureFile(e.target.files[0]);
    } else {
      capturedFile = null;
      lastCapturedFile = null;
      lastCompletedFile = null;
      fileCaptureTime = 0; // v3.0.32: 清空文件时重置时间戳
      autoFilledNumber = null;
      autoFilledBuyer = null;
      hideLoading();
    }
  }
}

function onFileDrop(e) {
  if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
    // v3.0.0: 同 onFileChange，付款申请页面非Drawer内不上传不识别
    if (isPaymentApplicationPage() && !e.target.closest('.el-drawer')) {
      console.log('[发票检查 v3.0] 付款申请页面拖拽上传（非Drawer内），跳过发票识别');
      return;
    }
    // v3.0.30: 同 onFileChange，Drawer 内进一步校验标题白名单
    if (isPaymentApplicationPage() && e.target.closest('.el-drawer') && !isInvoiceDrawer(e.target)) {
      console.log('[发票检查 v3.0.30] 付款申请页面非发票Drawer内拖拽上传，跳过发票识别');
      return;
    }
    captureFile(e.dataTransfer.files[0]);
  }
}

// ====== 3. 脉冲呼吸加载动画 ======
function showLoading() {
  let old = document.getElementById('ic-loading');
  if (old) old.remove();
  const m = document.createElement('div');
  m.id = 'ic-loading';
  const shadow = m.attachShadow({ mode: 'open' });

  const quoteHtml = '<div class="quote-box">\u2728 ' + randomQuote() + '</div>';

  shadow.innerHTML = `
    <style>
      .overlay{position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.3);z-index:2147483646;display:flex;align-items:center;justify-content:center;font-family:'Microsoft YaHei',sans-serif}
      .card{background:#fff;border-radius:18px;padding:32px 48px 28px;box-shadow:0 8px 36px rgba(0,0,0,.12);display:flex;flex-direction:column;align-items:center;gap:16px;min-width:360px}
      .pulse-loader{position:relative;width:80px;height:80px;margin:0 auto 8px}
      .pulse-loader .ring{position:absolute;top:0;left:0;width:80px;height:80px;border-radius:50%;border:3px solid #4A90D9;animation:pulseRing 1.8s ease-out infinite}
      .pulse-loader .ring:nth-child(2){animation-delay:.6s}
      .pulse-loader .ring:nth-child(3){animation-delay:1.2s}
      @keyframes pulseRing{0%{transform:scale(.5);opacity:.8}100%{transform:scale(1.2);opacity:0}}
      .pulse-loader .core{position:absolute;top:50%;left:50%;width:36px;height:36px;transform:translate(-50%,-50%);animation:pulseCore 1.8s ease-in-out infinite}
      @keyframes pulseCore{0%,100%{transform:translate(-50%,-50%) scale(1);opacity:1}50%{transform:translate(-50%,-50%) scale(.85);opacity:.7}}
      .pulse-loader .core svg{width:100%;height:100%}
      .text{font-size:14px;color:#888;display:flex;align-items:center;gap:1px;letter-spacing:.5px}
      .dot{font-size:16px;font-weight:bold;animation:dotP 1.2s infinite}
      .dot:nth-child(2){animation-delay:.2s}
      .dot:nth-child(3){animation-delay:.4s}
      @keyframes dotP{0%,80%,100%{opacity:.15}40%{opacity:1}}
      .quote-box{width:100%;padding:10px 14px;background:linear-gradient(135deg,#ecf5ff 0%,#f0f9eb 100%);border-radius:8px;border-left:3px solid #4A90D9;font-size:12.5px;color:#606266;line-height:1.6;font-style:italic}
    </style>
    <div class="overlay">
      <div class="card">
        <div class="pulse-loader">
          <div class="ring"></div><div class="ring"></div><div class="ring"></div>
          <div class="core">
            <svg viewBox="0 0 36 36" xmlns="http://www.w3.org/2000/svg">
              <rect x="7" y="2" width="22" height="30" rx="3" fill="#4A90D9" opacity=".15"/>
              <rect x="7" y="2" width="22" height="30" rx="3" fill="none" stroke="#4A90D9" stroke-width="1.8"/>
              <line x1="12" y1="10" x2="24" y2="10" stroke="#4A90D9" stroke-width="1.5" stroke-linecap="round"/>
              <line x1="12" y1="15" x2="24" y2="15" stroke="#4A90D9" stroke-width="1.5" stroke-linecap="round"/>
              <line x1="12" y1="20" x2="20" y2="20" stroke="#4A90D9" stroke-width="1.5" stroke-linecap="round"/>
              <circle cx="24" cy="25" r="5" fill="#fff"/>
              <circle cx="24" cy="25" r="5" fill="none" stroke="#4A90D9" stroke-width="1.5"/>
              <line x1="24" y1="22.5" x2="24" y2="27.5" stroke="#4A90D9" stroke-width="1.5" stroke-linecap="round"/>
              <line x1="21.5" y1="25" x2="26.5" y2="25" stroke="#4A90D9" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
          </div>
        </div>
        <div class="text">
          正在读取发票信息，请稍候<span class="dot">.</span><span class="dot">.</span><span class="dot">.</span>
        </div>
        ${quoteHtml}
      </div>
    </div>`;
  document.body.appendChild(m);
}

function hideLoading() {
  const m = document.getElementById('ic-loading');
  if (m) m.remove();
}

// ====== 提交拦截 ======
function blockSubmit() {
  const btns = document.querySelectorAll('button');
  btns.forEach(btn => {
    const t = (btn.textContent || '').trim();
    if (t === '确定' || t === '提交' || t === '保存') {
      if (!btn.dataset.icBlocked) {
        btn.dataset.icBlocked = 'true';
        btn.addEventListener('click', function(e) {
          if (checkInProgress || lastCheckResult === null) {
            e.stopImmediatePropagation();
            e.preventDefault();
            showLoading();
            return false;
          }
          if (lastCheckResult === false) {
            const r = confirm('发票类型不匹配，确定要提交吗？');
            if (!r) { e.stopImmediatePropagation(); e.preventDefault(); return false; }
          }
        }, true);
      }
    }
  });
}

// ====== 4. AI检查 ======
function doCheck() {
  if (!capturedFile) return;
  // v3.0.13: 防止短时间内重复调用（MutationObserver/onClickRadio 二次触发）
  const now = Date.now();
  if (now - lastCheckTimestamp < CHECK_DEBOUNCE_MS) {
    console.log('[发票检查 v3.0] doCheck 被忽略（距上次检查仅', (now - lastCheckTimestamp), 'ms <', CHECK_DEBOUNCE_MS, 'ms 防抖窗口）');
    return;
  }
  const type = readInvoiceType() || currentInvoiceType || '未知';
  const thisSeq = ++checkSeq;
  console.log('[发票检查] 开始AI检查 #' + thisSeq + ', 文件:', capturedFile.fileName, '选择类型:', type);
  checkInProgress = true;
  lastCheckTimestamp = now; // v3.0.13: 记录本次检查时间，防止重复触发
  lastCheckResult = null;
  showLoading();
  blockSubmit();

  fetch(PS, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ file_data: capturedFile.fileData, file_name: capturedFile.fileName, selected_type: type })
  })
  .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
  .then(async r => {
    if (thisSeq !== checkSeq) return;
    checkInProgress = false;
    if (r.error) {
      console.error('[发票检查] AI错误:', r.error);
      lastCheckResult = true;
      showWarning(type, 'AI识别失败');
      hideLoading();
      return;
    }
    console.log('[发票检查] #' + thisSeq + ' 结果:', r);

    // v2.5.10: 统一收集所有自动填写结果
    let fillResults = [];

    // 填发票号（v3.0.18: 移除 detected_type 限制，tryFillInvoiceNumber内部自行判断）
    if (r.invoice_number) {
      const numResult = tryFillInvoiceNumber(r.invoice_number, r.detected_type, r.invoice_number_valid);
      if (numResult) fillResults.push(numResult);
    }

    // 填购买方（await确保结果完整）
    // v3.0.0: 付款申请页面(/addFinancialdetail)中购买方字段已被系统锁死，禁止自动填写
    // 必须与付款申请单的付款单位保持一致，自动修改会造成数据错乱
    // v3.0.18: 移除 detected_type 限制，tryFillBuyer内部自行判断（detectedType==='其他'返回null）
    if (r.invoice_buyer && !isPaymentApplicationPage()) {
      const buyerResult = await tryFillBuyer(r.invoice_buyer, r.detected_type);
      if (buyerResult) fillResults.push(buyerResult);
    }
    if (r.invoice_buyer && isPaymentApplicationPage()) {
      console.log('[发票检查 v3.0] 付款申请页面，校验购买方（系统已锁定：' + r.invoice_buyer + '）');
      const buyerVerifyResult = verifyPageBuyer(r.invoice_buyer);
      if (buyerVerifyResult) fillResults.push(buyerVerifyResult);
    }

    // v2.5.22: 缓存完整AI识别结果，供用户手动打开明细弹窗时使用
    lastCheckResultData = r;
    console.log('[发票检查 v2.5] AI结果已缓存, detected_type=' + (r.detected_type || '未知'));

    // ====== 类型不匹配处理 ======
    if (!r.is_match) {
      lastCheckResult = false;
      hideLoading();
      // v3.0.13: 合并为单一弹窗（不再分别调 showWarning + scheduleFillConfirm）
      // 同时展示类型不匹配警告 + 已填写的字段信息，避免用户看到2个弹窗
      await showTypeMismatchWarning(type, r.detected_type, fillResults);
      chrome.runtime.sendMessage({ action: 'notify', title: '发票类型检查提醒', message: '选择: ' + type + ', 识别: ' + r.detected_type + '，不一致!' }).catch(() => {});
    } else {
      // ====== 类型匹配 ======
      lastCheckResult = true;
      hideLoading();
      // v2.5.22: 直接弹主表确认窗，不再自动点"新增明细"
      // 金额/税率等信息将在用户手动点击"新增明细"后由 tryFillDetail 处理
      scheduleFillConfirm('ic-fill-confirm', fillResults);
    }
  })
  .catch(e => {
    if (thisSeq !== checkSeq) return;
    checkInProgress = false;
    lastCheckResult = true;
    console.error('[发票检查] 请求失败:', e);
    // v3.0.13: 区分 Extension context invalidated（扩展更新后上下文失效）和真正的服务未启动
    if (isContextInvalidated(e)) {
      console.warn('[发票检查 v3.0] Extension context 已失效（可能扩展刚被更新），跳过弹窗');
      hideLoading();
      return;
    }
    showWarning(type, '服务连接失败，请确认Python服务已启动');
    hideLoading();
  });
  // v3.0.31: 记录已完成检查的文件，防止 MutationObserver 二次触发（如取消关闭抽屉）
  lastCompletedFile = lastCapturedFile ? lastCapturedFile.fileName : null;
  capturedFile = null;
}

// ====== 自动填发票号 ======
function tryFillInvoiceNumber(number, detectedType, isValid) {
  if (!number) return null;
  if (!icToggleBuyer) { console.log('[发票检查 v3.0] 发票号识别已关闭，跳过'); return null; }
  if (autoFilledNumber === number) return null;

  const labels = document.querySelectorAll('.el-form-item__label, label, .ant-form-item-label, th, .form-item-label, .ant-form-item-required');
  let targetInput = null;

  for (const label of labels) {
    const text = (label.textContent || '').trim();
    if (text === '发票号' || text === '发票号码' || text.includes('发票号') || text.includes('发票号码')) {
      const formItem = label.closest('.el-form-item, .ant-form-item, tr, .form-group, .form-item');
      if (formItem) {
        const inputs = formItem.querySelectorAll('input[type="text"], input:not([type]), input[type="tel"], textarea');
        for (const inp of inputs) {
          if (inp.offsetParent !== null && !inp.disabled && !inp.readOnly) {
            targetInput = inp;
            break;
          }
        }
        if (targetInput) break;
      }
    }
  }

  if (!targetInput) return null;

  setInputValue(targetInput, number);
  autoFilledNumber = number;
  const numLen = number.length;
  if (isValid === false) {
    targetInput.style.border = '2px solid #f56c6c';
    targetInput.style.boxShadow = '0 0 4px rgba(245,108,108,0.4)';
    return '发票号: ' + number + '（' + numLen + '位，需人工核对）';
  } else {
    console.log('[发票检查] ✓ 已自动填发票号:', number);
    return '发票号: ' + number;
  }
}

// ====== Toast 提示 ======
function showToast(msg, type) {
  const old = document.getElementById('ic-toast');
  if (old) old.remove();
  const oldStyle = document.getElementById('ic-toast-style');
  if (oldStyle) oldStyle.remove();

  const isWarning = type === 'warning';
  const bg = isWarning ? 'rgba(245,108,108,0.95)' : 'rgba(67,194,58,0.95)';
  const prefix = isWarning ? '' : '✓ ';

  const t = document.createElement('div');
  t.id = 'ic-toast';
  t.style.cssText = 'position:fixed;top:24px;left:50%;transform:translateX(-50%);background:' + bg + ';color:#fff;padding:12px 28px;border-radius:8px;font-size:14px;z-index:2147483647;font-family:Microsoft YaHei,sans-serif;box-shadow:0 4px 16px rgba(0,0,0,0.2);animation:icToastIn .3s ease-out;max-width:80%;text-align:center;line-height:1.5';
  t.textContent = prefix + msg;

  const style = document.createElement('style');
  style.id = 'ic-toast-style';
  style.textContent = '@keyframes icToastIn{from{opacity:0;transform:translateX(-50%) translateY(-20px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}';
  document.head.appendChild(style);
  document.body.appendChild(t);
  setTimeout(() => {
    t.style.transition = 'opacity .3s';
    t.style.opacity = '0';
    setTimeout(() => { t.remove(); style.remove(); }, 300);
  }, 2800);
}

// ====== 警告弹窗（返回Promise） ======
function showWarning(selected, detected) {
  return new Promise((resolve) => {
    const old = document.getElementById('ic-modal');
    if (old) old.remove();
    const m = document.createElement('div');
    m.id = 'ic-modal';
    const shadow = m.attachShadow({ mode: 'open' });
    shadow.innerHTML = `
      <style>
        .overlay{position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.5);z-index:2147483647;display:flex;align-items:center;justify-content:center;font-family:Microsoft YaHei,sans-serif}
        .card{background:#fff;border-radius:12px;padding:28px 32px;max-width:420px;width:90%;box-shadow:0 8px 32px rgba(0,0,0,.3)}
        .title{display:flex;align-items:center;margin-bottom:16px}
        .icon{font-size:28px;margin-right:10px}
        .txt{font-size:18px;font-weight:600;color:#e6a23c}
        .body{font-size:14px;color:#606266;line-height:1.8;margin-bottom:20px}
        .sel{color:#409eff;font-weight:bold}
        .det{color:#67c23a;font-weight:bold}
        .hint{margin:12px 0 0;color:#909399;font-size:13px}
        .footer{text-align:right}
        .btn{background:#409eff;color:#fff;border:none;padding:8px 24px;border-radius:6px;cursor:pointer;font-size:14px}
        .btn:hover{background:#66b1ff}
      </style>
      <div class="overlay" id="overlay">
        <div class="card">
          <div class="title"><span class="icon">⚠️</span><span class="txt">发票类型不匹配</span></div>
          <div class="body">
            <p>您选择的类型：<span class="sel">${selected}</span></p>
            <p>AI识别的类型：<span class="det">${detected}</span></p>
            <p class="hint">请确认是否需要修改发票类型</p>
          </div>
          <div class="footer"><button class="btn" id="closebtn">知道了</button></div>
        </div>
      </div>`;
    document.body.appendChild(m);
    shadow.getElementById('closebtn').onclick = () => { m.remove(); resolve(); };
    shadow.getElementById('overlay').onclick = (e) => { if (e.target === e.currentTarget) { m.remove(); resolve(); } };
  });
}

// ====== v3.0.13: 类型不匹配 + 填写结果 合并弹窗（替代 showWarning + showFillConfirm 双弹窗） ======
function showTypeMismatchWarning(selected, detected, fillResults) {
  return new Promise((resolve) => {
    const old = document.getElementById('ic-modal');
    if (old) old.remove();
    const m = document.createElement('div');
    m.id = 'ic-modal';
    const shadow = m.attachShadow({ mode: 'open' });

    // 构建已填写项的 HTML
    const itemsHtml = (fillResults && fillResults.length > 0)
      ? '<div style="margin-top:12px;padding-top:12px;border-top:1px solid #ebeef5">' +
        '<p style="font-size:13px;color:#606266;margin-bottom:8px">以下字段已自动填写：</p>' +
        '<ul style="padding-left:20px;margin:0;list-style:none">' +
        fillResults.map(it =>
          '<li style="margin:4px 0;font-size:13px;color:#303133">' +
          '<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:#67c23a;margin-right:8px;vertical-align:middle"></span>' +
          it + '</li>'
        ).join('') +
        '</ul></div>'
      : '';

    shadow.innerHTML = `
      <style>
        .overlay{position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.5);z-index:2147483647;display:flex;align-items:center;justify-content:center;font-family:Microsoft YaHei,sans-serif}
        .card{background:#fff;border-radius:12px;padding:28px 32px;max-width:460px;width:90%;box-shadow:0 8px 32px rgba(0,0,0,.3)}
        .title{display:flex;align-items:center;margin-bottom:16px}
        .icon{font-size:28px;margin-right:10px}
        .txt{font-size:18px;font-weight:600;color:#e6a23c}
        .body{font-size:14px;color:#606266;line-height:1.8;margin-bottom:0}
        .sel{color:#409eff;font-weight:bold}
        .det{color:#67c23a;font-weight:bold}
        .hint{color:#909399;font-size:13px}
        .footer{text-align:right;margin-top:16px}
        .btn{background:#409eff;color:#fff;border:none;padding:8px 24px;border-radius:6px;cursor:pointer;font-size:14px}
        .btn:hover{background:#66b1ff}
      </style>
      <div class="overlay" id="overlay">
        <div class="card">
          <div class="title"><span class="icon">⚠️</span><span class="txt">发票类型不匹配</span></div>
          <div class="body">
            <p>您选择的类型：<span class="sel">${selected}</span></p>
            <p>AI识别的类型：<span class="det">${detected}</span></p>
            ${itemsHtml}
            <p class="hint" style="margin-top:${itemsHtml ? '12px' : '0'}">请确认是否需要修改发票类型</p>
          </div>
          <div class="footer"><button class="btn" id="closebtn">知道了</button></div>
        </div>
      </div>`;
    document.body.appendChild(m);
    shadow.getElementById('closebtn').onclick = () => { m.remove(); resolve(); };
    shadow.getElementById('overlay').onclick = (e) => { if (e.target === e.currentTarget) { m.remove(); resolve(); } };
  });
}

// ====== v3.0.13: Extension context 失效检测 ======
function isContextInvalidated(error) {
  if (!error) return false;
  const msg = error.message || error.toString() || '';
  return msg.includes('Extension context invalidated') ||
         msg.includes('Extension has been destroyed') ||
         msg.includes('context invalidated');
}

// ====== 填写确认弹窗（v2.5.10: 发票号+购买方统一提示） ======
// v3.0.29: 发票号行增加手工校验区（输入框 + "校验"按钮）
function showFillConfirm(elementId, items) {
  if (document.getElementById(elementId)) return;

  const m = document.createElement('div');
  m.id = elementId;
  const shadow = m.attachShadow({ mode: 'open' });

  // 构建列表 HTML，发票号项附加校验区
  let recognizedInvoiceNumber = '';
  const itemsHtmlArr = items.map((it, idx) => {
    const isWarn = it.startsWith('⚠️') || it.startsWith('⚠');
    const liClass = isWarn ? 'warn' : '';
    // 检测是否包含"发票号"，提取识别出的号码供校验使用
    const isInvoiceNumber = it.includes('发票号') || it.includes('发票号码');
    if (isInvoiceNumber) {
      const match = it.match(/[:：]\s*(.+)/);
      recognizedInvoiceNumber = match ? match[1].trim() : '';
      return '{' + idx + '}';  // 占位符，后面替换
    }
    return '<li style="margin:6px 0;font-size:14px;color:#303133">' +
      (isWarn ? '<span style="color:#f56c6c">' + it + '</span>' : it) +
      '</li>';
  });

  // 把发票号那一行替换为带校验区的 HTML
  const invoiceNumberRow = recognizedInvoiceNumber
    ? '<li style="margin:10px 0 4px 0;font-size:14px;color:#303133">' +
        '<div style="display:flex;align-items:flex-start;gap:6px">' +
          '<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:#67c23a;margin-right:2px;margin-top:6px;flex-shrink:0"></span>' +
          '<div style="flex:1">' + items.find(it => it.includes('发票号') || it.includes('发票号码')) +
            '<div style="margin-top:6px;display:flex;align-items:center;gap:6px;flex-wrap:wrap">' +
              '<input type="text" id="ic-verify-input" placeholder="手工输入发票号进行校验" ' +
                'style="flex:1;min-width:160px;padding:5px 8px;border:1px solid #dcdfe6;border-radius:4px;font-size:13px;outline:none;font-family:inherit"' +
                ' onfocus="this.style.borderColor=\'#409eff\'" onblur="this.style.borderColor=\'#dcdfe6\'">' +
              '<button id="ic-verify-btn" ' +
                'style="background:#409eff;color:#fff;border:none;padding:5px 14px;border-radius:4px;cursor:pointer;font-size:13px;white-space:nowrap">校验</button>' +
            '</div>' +
            '<div id="ic-verify-result" style="margin-top:4px;font-size:12px;min-height:18px"></div>' +
          '</div>' +
        '</div>' +
      '</li>'
    : '';

  // 替换占位符
  let itemsHtml = itemsHtmlArr.join('');
  if (recognizedInvoiceNumber) {
    const phIdx = itemsHtmlArr.findIndex(s => s.startsWith('{'));
    itemsHtml = itemsHtmlArr.map((s, i) => i === phIdx ? invoiceNumberRow : s).join('');
  }

  shadow.innerHTML = `
    <style>
      .overlay{position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.4);z-index:2147483647;display:flex;align-items:center;justify-content:center;font-family:Microsoft YaHei,sans-serif}
      .card{background:#fff;border-radius:12px;padding:24px 28px;max-width:540px;width:92%;box-shadow:0 8px 32px rgba(0,0,0,.25)}
      .title{font-size:16px;font-weight:600;color:#409eff;margin-bottom:12px;display:flex;align-items:center;gap:8px}
      .body{font-size:13px;color:#606266;line-height:1.6;margin-bottom:16px}
      .items{padding-left:16px;margin:8px 0;list-style:none}
      .hint{color:#e6a23c;font-size:13px;margin-top:10px;padding-top:10px;border-top:1px solid #ebeef5}
      .footer{text-align:right;margin-top:16px}
      .btn{background:#409eff;color:#fff;border:none;padding:8px 20px;border-radius:6px;cursor:pointer;font-size:13px}
      .btn:hover{background:#66b1ff}
    </style>
    <div class="overlay" id="overlay">
      <div class="card">
        <div class="title">✅ AI自动识别填写结果</div>
        <div class="body">
          <p>以下字段已由AI自动识别并填写：</p>
          <ul class="items">${itemsHtml}</ul>
          <p class="hint">⚠️ 请核实以上信息是否正确，可手工校验发票号</p>
        </div>
        <div class="footer"><button class="btn" id="closebtn">知道了，我会复查</button></div>
      </div>
    </div>`;
  document.body.appendChild(m);

  // "校验"按钮逻辑
  const verifyBtn = shadow.getElementById('ic-verify-btn');
  const verifyInput = shadow.getElementById('ic-verify-input');
  const verifyResult = shadow.getElementById('ic-verify-result');
  if (verifyBtn && verifyInput && verifyResult) {
    verifyBtn.onclick = () => {
      const userInput = (verifyInput.value || '').trim();
      if (!userInput) {
        verifyResult.innerHTML = '<span style="color:#e6a23c">⚠️ 请先输入发票号</span>';
        return;
      }
      // 宽松比对：忽略空格，不区分大小写
      const normAI = recognizedInvoiceNumber.replace(/\s+/g, '').toLowerCase();
      const normUser = userInput.replace(/\s+/g, '').toLowerCase();
      if (normUser === normAI) {
        verifyResult.innerHTML = '<span style="color:#67c23a">✓ 校验一致</span>';
        verifyResult.style.animation = 'none';
        verifyResult.offsetHeight; // reflow
        verifyResult.style.animation = 'icFadeIn 0.3s';
      } else {
        verifyResult.innerHTML = '<span style="color:#f56c6c">⚠️ 不一致！AI识别：' +
          '<b>' + recognizedInvoiceNumber + '</b>，您输入：<b>' + userInput + '</b></span>';
        verifyResult.style.animation = 'none';
        verifyResult.offsetHeight;
        verifyResult.style.animation = 'icFadeIn 0.3s';
      }
    };
    // 回车也触发校验
    verifyInput.onkeydown = (e) => { if (e.key === 'Enter') verifyBtn.onclick(); };
  }

  shadow.getElementById('closebtn').onclick = () => m.remove();
  shadow.getElementById('overlay').onclick = (e) => { if (e.target === e.currentTarget) m.remove(); };
}

// ====== v2.5.11: 延迟合并弹窗（避免 doCheck 和 tryFillDetail 双弹窗） ======
function scheduleFillConfirm(elementId, items) {
  if (!items || items.length === 0) return;
  setTimeout(() => {
    if (detailFillInProgress) {
      // tryFillDetail 正在跑，暂存到 pendingFillResults 等它完成后合并
      pendingFillResults = pendingFillResults.concat(items);
      console.log('[发票检查 v2.5] doCheck 暂存弹窗内容（tryFillDetail 正在跑）:', items.length, '项, pending总数=' + pendingFillResults.length);
    } else {
      showFillConfirm(elementId, items);
      pendingFillResults = [];
    }
  }, 600);
}

// ====== 常驻浮窗 ======
// v2.5.14-fix: 拖拽监听器提升为模块级变量，deactivate 时移除，避免 SPA 反复进出页面累积监听器导致内存泄漏与拖拽卡顿
let _floatMoveHandler = null;
let _floatUpHandler = null;

/**
 * 检查 Python 服务是否存活 - v2.5.25
 * @returns {Promise<boolean>} true=服务正常, false=未启动/无响应
 */
async function checkServiceAlive() {
  try {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 2000); // 2秒超时
    const resp = await fetch('http://127.0.0.1:52100/', { method: 'GET', signal: controller.signal });
    return resp.ok || (resp.status >= 400 && resp.status < 600); // 有响应就算活着(即使404)
  } catch {
    return false;
  }
}

function showFloat() {
  if (document.getElementById('ic-float')) return;
  const fw = document.createElement('div');
  fw.id = 'ic-float';
  // v3.0.28: 移除关闭按钮(×), 增加两个开关, 增加宽度和padding容纳开关
  fw.style.cssText = 'position:fixed;bottom:12px;right:12px;background:rgba(103,194,58,0.92);color:#fff;padding:8px 14px;border-radius:8px;font-size:12px;z-index:2147483646;font-family:Microsoft YaHei,sans-serif;box-shadow:0 2px 8px rgba(0,0,0,.2);cursor:move;user-select:none;line-height:22px;min-width:290px';

  const buyerOn = icToggleBuyer ? '#fff' : 'rgba(255,255,255,0.25)';
  const buyerBg = icToggleBuyer ? '#fff' : 'transparent';
  const amountOn = icToggleAmount ? '#fff' : 'rgba(255,255,255,0.25)';
  const amountBg = icToggleAmount ? '#fff' : 'transparent';
  // v3.0.36: 提交再检查开关颜色（用橙色区分，表示"延迟校验"模式）
  const verifyOn = icToggleVerify ? '#fff' : 'rgba(255,255,255,0.25)';
  const verifyBg = icToggleVerify ? '#e6a23c' : 'transparent';

  fw.innerHTML =
    '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">' +
      '<span id="ic-svc-light" style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#888;flex-shrink:0" title="Python服务状态检测中..."></span>' +
      '<span style="font-weight:600;margin-right:4px">发票检查 v3.0.39</span>' +
      '<span style="opacity:.7;font-size:10px">by 陆琦</span>' +
      // v3.0.34: 一键重启服务图标按钮 — 放在"陆琦"后面，仅刷新图标无文字，title提示功能
      '<span id="ic-restart-btn" style="cursor:pointer;opacity:.6;font-size:12px;transition:opacity .2s,transform .2s;user-select:none" title="重启Python服务">🔄</span>' +
      // v3.0.36: 校验报告下载按钮 — 仅在校验完成后显示
      '<span id="ic-report-btn" style="cursor:pointer;opacity:.8;font-size:12px;transition:opacity .2s;user-select:none;display:none" title="查看校验报告">📋</span>' +
      // v3.0.36: 校验进度显示 — 正在校验时显示剩余数量
      '<span id="ic-verify-progress" style="opacity:.7;font-size:10px;display:none;margin-left:auto"></span>' +
      '<span style="opacity:.7;font-size:10px;margin-left:auto">(' + (SAVED_BUYERS.length || 0) + '家)</span>' +
    '</div>' +
    '<div style="display:flex;align-items:center;gap:8px;margin-top:5px;font-size:11px;flex-wrap:wrap">' +
      // 开关1: 发票号+购买方
      '<label style="display:flex;align-items:center;gap:4px;cursor:pointer;opacity:' + (icToggleBuyer ? '1' : '0.6') + '" id="ic-toggle-buyer-label">' +
        '<span>发票号&购买方</span>' +
        '<span id="ic-toggle-buyer" style="display:inline-block;width:28px;height:14px;border-radius:7px;background:' + (icToggleBuyer ? '#fff' : 'rgba(255,255,255,0.2)') + ';position:relative;transition:background .25s;flex-shrink:0">' +
          '<span style="position:absolute;top:1px;left:' + (icToggleBuyer ? '15px' : '2px') + ';width:10px;height:10px;border-radius:50%;background:' + (icToggleBuyer ? '#67c23a' : '#aaa') + ';transition:left .25s,background .25s"></span>' +
        '</span>' +
      '</label>' +
      // 开关2: 金额+税率
      '<label style="display:flex;align-items:center;gap:4px;cursor:pointer;opacity:' + (icToggleAmount ? '1' : '0.6') + '" id="ic-toggle-amount-label">' +
        '<span>金额&税率</span>' +
        '<span id="ic-toggle-amount" style="display:inline-block;width:28px;height:14px;border-radius:7px;background:' + (icToggleAmount ? '#fff' : 'rgba(255,255,255,0.2)') + ';position:relative;transition:background .25s;flex-shrink:0">' +
          '<span style="position:absolute;top:1px;left:' + (icToggleAmount ? '15px' : '2px') + ';width:10px;height:10px;border-radius:50%;background:' + (icToggleAmount ? '#67c23a' : '#aaa') + ';transition:left .25s,background .25s"></span>' +
        '</span>' +
      '</label>' +
      // v3.0.36: 开关3: 提交再检查（橙色主题，表示延迟模式）
      '<label style="display:flex;align-items:center;gap:4px;cursor:pointer;opacity:' + (icToggleVerify ? '1' : '0.6') + '" id="ic-toggle-verify-label" title="开启后：上传附件不即时识别，点确定时后台校验并生成报告">' +
        '<span style="color:#ffe4b3">提交再查</span>' +
        '<span id="ic-toggle-verify" style="display:inline-block;width:28px;height:14px;border-radius:7px;background:' + (icToggleVerify ? '#e6a23c' : 'rgba(255,255,255,0.2)') + ';position:relative;transition:background .25s;flex-shrink:0">' +
          '<span style="position:absolute;top:1px;left:' + (icToggleVerify ? '15px' : '2px') + ';width:10px;height:10px;border-radius:50%;background:' + (icToggleVerify ? '#e6a23c' : '#aaa') + ';transition:left .25s,background .25s"></span>' +
        '</span>' +
      '</label>' +
    '</div>';

  document.body.appendChild(fw);

  // 开关1 点击事件
  // v3.0.39: 互斥逻辑 — "提交再查"与即时识别两个开关互斥（同一时间只能选一种模式）
  // 开启左边任意一个即时识别开关时，自动关闭"提交再查"；反之亦然
  fw.querySelector('#ic-toggle-buyer-label').onclick = (e) => {
    e.stopPropagation();
    icToggleBuyer = !icToggleBuyer;
    // 如果开启了即时识别，自动关闭提交再查模式
    if (icToggleBuyer && icToggleVerify) {
      icToggleVerify = false;
      unhookConfirmButton(); // 卸载确定按钮拦截器
    }
    updateToggleUI(fw);
  };
  // 开关2 点击事件
  fw.querySelector('#ic-toggle-amount-label').onclick = (e) => {
    e.stopPropagation();
    icToggleAmount = !icToggleAmount;
    // 同上：开启即时识别时自动关闭提交再查
    if (icToggleAmount && icToggleVerify) {
      icToggleVerify = false;
      unhookConfirmButton(); // 卸载确定按钮拦截器
    }
    updateToggleUI(fw);
  };
  // v3.0.36: 开关3 点击事件 — 提交再检查
  fw.querySelector('#ic-toggle-verify-label').onclick = (e) => {
    e.stopPropagation();
    icToggleVerify = !icToggleVerify;
    // 开启提交再查模式时，自动关闭两个即时识别开关
    if (icToggleVerify) {
      icToggleBuyer = false;
      icToggleAmount = false;
      hookConfirmButton(); // 安装拦截：监听确定按钮，收集表单数据发送校验
      console.log('[发票检查 v3.0.39] 提交再查已开启 → 即时识别(发票号&购买方、金额&税率)已自动关闭');
    } else {
      unhookConfirmButton(); // 卸载拦截：恢复即时识别模式
      console.log('[发票检查 v3.0.39] 提交再查已关闭 → 恢复即时识别');
    }
    updateToggleUI(fw);
    // 切换开关后，安装或卸载确定按钮拦截器
    if (icToggleVerify) {
      hookConfirmButton(); // 安装拦截：监听确定按钮，收集表单数据发送校验
      console.log('[发票检查 v3.0.39] 提交再检查模式已开启：即时识别已停止，将监听【确定】按钮');
    } else {
      unhookConfirmButton(); // 卸载拦截：恢复即时识别模式
      console.log('[发票检查 v3.0.39] 提交再检查模式已关闭：恢复即时识别');
    }
  };
  // v3.0.36: 校验报告下载按钮 — 点击弹出预览窗口（复制+下载）
  const reportBtn = fw.querySelector('#ic-report-btn');
  if (reportBtn) {
    reportBtn.onmouseover = () => { reportBtn.style.opacity = '1'; reportBtn.style.transform = 'scale(1.15)'; };
    reportBtn.onmouseout = () => { reportBtn.style.opacity = '.8'; reportBtn.style.transform = 'scale(1)'; };
    reportBtn.onclick = (e) => {
      e.stopPropagation();
      showVerifyReportPreview();
    };
  }

  let dragging = false, sx = 0, sy = 0, ox = 0, oy = 0;
  fw.onmousedown = (e) => { if (e.target.closest('label')) return; dragging = true; sx = e.clientX; sy = e.clientY; const r = fw.getBoundingClientRect(); ox = r.left; oy = r.top; e.preventDefault(); };
  _floatMoveHandler = (e) => { if (!dragging) return; fw.style.left = (ox + e.clientX - sx) + 'px'; fw.style.top = (oy + e.clientY - sy) + 'px'; fw.style.right = 'auto'; fw.style.bottom = 'auto'; };
  _floatUpHandler = () => { dragging = false; };
  document.addEventListener('mousemove', _floatMoveHandler);
  document.addEventListener('mouseup', _floatUpHandler);

  // v3.0.34: 一键重启服务按钮
  const restartBtn = fw.querySelector('#ic-restart-btn');
  if (restartBtn) {
    // 图标按钮 hover 效果：opacity 1 + 轻微旋转，松手恢复
    restartBtn.onmouseover = () => { restartBtn.style.opacity = '1'; restartBtn.style.transform = 'rotate(180deg)'; };
    restartBtn.onmouseout = () => { restartBtn.style.opacity = '.6'; restartBtn.style.transform = 'rotate(0deg)'; };
    restartBtn.onclick = (e) => {
      e.stopPropagation();
      restartService(restartBtn, fw.querySelector('#ic-svc-light'));
    };
  }

  updateServiceLight(fw.querySelector('#ic-svc-light'));

  // v3.0.37: 浮标初始化时恢复历史校验报告（防弹窗关闭/刷新丢失）
  loadVerifyReportsFromStorage();
}

// v3.0.28: 开关 UI 更新函数
function updateToggleUI(fw) {
  // 开关1: 发票号&购买方
  const buyerBtn = fw.querySelector('#ic-toggle-buyer');
  const buyerLabel = fw.querySelector('#ic-toggle-buyer-label');
  const buyerDot = buyerBtn.querySelector('span');
  buyerBtn.style.background = icToggleBuyer ? '#fff' : 'rgba(255,255,255,0.2)';
  buyerDot.style.left = icToggleBuyer ? '15px' : '2px';
  buyerDot.style.background = icToggleBuyer ? '#67c23a' : '#aaa';
  buyerLabel.style.opacity = icToggleBuyer ? '1' : '0.65';

  // 开关2: 金额&税率
  const amountBtn = fw.querySelector('#ic-toggle-amount');
  const amountLabel = fw.querySelector('#ic-toggle-amount-label');
  const amountDot = amountBtn.querySelector('span');
  amountBtn.style.background = icToggleAmount ? '#fff' : 'rgba(255,255,255,0.2)';
  amountDot.style.left = icToggleAmount ? '15px' : '2px';
  amountDot.style.background = icToggleAmount ? '#67c23a' : '#aaa';
  amountLabel.style.opacity = icToggleAmount ? '1' : '0.65';

  // v3.0.36: 开关3: 提交再检查（橙色主题）
  const verifyBtn = fw.querySelector('#ic-toggle-verify');
  const verifyLabel = fw.querySelector('#ic-toggle-verify-label');
  if (verifyBtn && verifyLabel) {
    const verifyDot = verifyBtn.querySelector('span');
    verifyBtn.style.background = icToggleVerify ? '#e6a23c' : 'rgba(255,255,255,0.2)';
    verifyDot.style.left = icToggleVerify ? '15px' : '2px';
    verifyDot.style.background = icToggleVerify ? '#e6a23c' : '#aaa';
    verifyLabel.style.opacity = icToggleVerify ? '1' : '0.65';
  }
}

/**
 * v2.5.25: 更新服务状态灯颜色
 * @param {HTMLElement} lightEl - 状态灯 span 元素
 */
async function updateServiceLight(lightEl) {
  if (!lightEl) return;
  const alive = await checkServiceAlive();
  if (alive) {
    lightEl.style.background = '#4cd964'; // 绿色 - 服务正常
    lightEl.title = 'Python 服务正常 (127.0.0.1:52100)';
  } else {
    lightEl.style.background = '#ff3b30'; // 红色 - 未启动
    lightEl.title = 'Python 服务未启动! 请双击 "发票识别助手启动.bat"';
  }
}

// v3.0.34: 一键重启服务 — 检测health，若未启动则复制启动bat路径到剪贴板并引导用户手动启动
async function restartService(btnEl, lightEl) {
  // 图标按钮进入检测状态：图标变为⏳并持续旋转，禁止重复点击
  btnEl.style.pointerEvents = 'none';
  btnEl.style.opacity = '1';
  btnEl.style.transform = 'rotate(360deg)';
  btnEl.style.transition = 'transform 0.8s linear';
  btnEl.textContent = '⏳';

  try {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 3000);
    const resp = await fetch('http://127.0.0.1:52100/health', { signal: controller.signal });

    if (resp.ok) {
      // ✅ 服务已在运行 — 图标变绿勾
      btnEl.textContent = '✅';
      btnEl.style.transform = 'rotate(0deg)';
      if (lightEl) { lightEl.style.background = '#4cd964'; lightEl.title = 'Python 服务正常'; }
    }
  } catch (e) {
    // ❌ 服务未启动 — 图标变红叉，复制启动bat路径到剪贴板
    btnEl.textContent = '❌';
    btnEl.style.transform = 'rotate(0deg)';
    if (lightEl) { lightEl.style.background = '#ff3b30'; lightEl.title = '服务未启动'; }

    // 复制启动bat路径，方便用户直接粘贴到运行窗口执行
    const batPath = 'C:\\Users\\UTLQ\\AppData\\Local\\InvoiceChecker\\发票识别助手启动.bat';
    try {
      await navigator.clipboard.writeText(batPath);
      showRestartTip(batPath, true); // 复制成功
    } catch (clipErr) {
      showRestartTip(batPath, false); // 复制失败，但仍显示路径
    }
  }

  // 3.5秒后恢复按钮为🔄图标
  setTimeout(() => {
    btnEl.textContent = '🔄';
    btnEl.style.transition = 'opacity .2s,transform .2s';
    btnEl.style.transform = 'rotate(0deg)';
    btnEl.style.pointerEvents = 'auto';
    btnEl.style.opacity = '.6';
    btnEl.style.cursor = 'pointer';
    // 刷新灯光状态
    if (lightEl) updateServiceLight(lightEl);
  }, 3500);
}

// v3.0.34: 显示重启引导提示弹窗
function showRestartTip(batPath, copied) {
  // 移除已有的提示
  const old = document.getElementById('ic-restart-tip');
  if (old) old.remove();

  const tip = document.createElement('div');
  tip.id = 'ic-restart-tip';
  tip.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:2147483647;'
    + 'background:#1a1a2e;color:#e0e0e0;padding:20px 24px;border-radius:12px;'
    + 'font-size:13px;box-shadow:0 8px 32px rgba(0,0,0,.4);'
    + 'font-family:"Microsoft YaHei",sans-serif;line-height:1.6;min-width:360px;text-align:center';

  tip.innerHTML =
    '<div style="font-size:16px;font-weight:600;margin-bottom:12px;color:#ff6b6b">⚠️ Python 服务未启动</div>'
    + '<div style="margin-bottom:8px;opacity:.8">请按以下步骤启动服务：</div>'
    + '<div style="background:#0d0d1a;padding:8px 12px;border-radius:6px;margin-bottom:12px;'
    +  'font-family:Consolas,monospace;font-size:11px;word-break:break-all;color:#a8d8ff">'
    + batPath.replace(/\\/g, '\\') + '</div>'
    + '<div style="margin-bottom:12px;opacity:.8">'
    +   '1️⃣ <b>Win+R</b> 打开运行 → <b>Ctrl+V</b> 粘贴 → <b>回车</b><br>'
    +   '2️⃣ 或在文件管理器中定位到该路径双击运行'
    + '</div>'
    + '<div style="font-size:12px;color:#4cd964;margin-bottom:12px">'
    +   (copied ? '✅ 路径已复制到剪贴板' : '⚠️ 复制失败，请手动复制上方路径')
    + '</div>'
    + '<button id="ic-restart-tip-close" style="background:rgba(255,255,255,.15);color:#fff;border:none;'
    +  'padding:6px 20px;border-radius:6px;cursor:pointer;font-size:12px;transition:background .2s"'
    +  'onmouseover="this.style.background=\'rgba(255,255,255,.25)\'" '
    +  'onmouseout="this.style.background=\'rgba(255,255,255,.15)\'">关闭</button>';

  document.body.appendChild(tip);

  // 点击关闭按钮
  tip.querySelector('#ic-restart-tip-close').onclick = () => tip.remove();
  // 8秒后自动消失
  setTimeout(() => { if (document.getElementById('ic-restart-tip')) tip.remove(); }, 8000);
}

// ====== v3.0.36: 提交再检查 — 核心函数集 ======

/** 确定按钮拦截器引用（用于后续卸载） */
let confirmBtnHandler = null;
let confirmBtnOriginalClick = null;

/**
 * 安装确定按钮点击拦截器
 * 原理：用 MutationObserver 监听 Drawer 内的 .el-button--primary 确定按钮出现，
 *       在其 click 事件前注入我们的校验逻辑（不阻止原操作）
 */
function hookConfirmButton() {
  if (confirmBtnHandler) return; // 防止重复安装

  confirmBtnHandler = (mutations) => {
    for (const mut of mutations) {
      for (const node of mut.addedNodes) {
        if (!node.querySelectorAll) continue;
        // 查找 Drawer 内的主按钮（确定）— 用 class 组合定位，避免误匹配其他按钮
        const btns = node.querySelectorAll
          ? node.querySelectorAll('.el-drawer .el-button--primary.el-button--small')
          : [];
        for (const btn of btns) {
          const text = (btn.textContent || '').trim();
          if (text !== '确定') continue;
          if (btn.dataset.icHooked === 'true') continue; // 防止重复绑定

          btn.dataset.icHooked = 'true';
          console.log('[发票检查 v3.0.39] 已拦截【确定】按钮');

          // 使用事件捕获阶段，在原 click 之前执行校验提交
          btn.addEventListener('click', function onConfirmClick(e) {
            if (!icToggleVerify || !lastCapturedFile) return;

            console.log('[发票检查 v3.0.39] 【确定】被点击，开始收集表单数据并提交校验');
            e.stopPropagation();

            // 收集表单当前填写的数据
            const formData = collectFormData();
            // 提交后台校验（不阻塞用户操作，异步排队执行）
            submitVerifyTask(lastCapturedFile.fileName, lastCapturedFile.fileData, formData);
          }, true); // capture phase — 确保在 Element UI 的原生 handler 之前执行
        }
      }
    }
  };

  // 启动 MutationObserver 监听 DOM 变化（Drawer 打开时按钮才出现）
  const observer = new MutationObserver(confirmBtnHandler);
  observer.observe(document.body, { childList: true, subtree: true });
  confirmBtnHandler._observer = observer;
}

/**
 * 卸载确定按钮拦截器
 */
function unhookConfirmButton() {
  if (confirmBtnHandler && confirmBtnHandler._observer) {
    confirmBtnHandler._observer.disconnect();
    confirmBtnHandler._observer = null;
    confirmBtnHandler = null;
    console.log('[发票检查 v3.0.39] 已卸载【确定】按钮拦截器');
  }
  // 移除所有已标记的 hook
  document.querySelectorAll('[data-ic-hooked="true"]').forEach(btn => {
    delete btn.dataset.icHooked;
  });
}

/**
 * 收集发票表单中用户填写的字段值
 * 通过 label 文本定位 input，读取当前 value
 * @returns {{invoice_number, buyer, seller, amount, tax_rate, tax_amount, invoice_type}}
 */
function collectFormData() {
  const labels = document.querySelectorAll('.el-form-item__label, label, .ant-form-item-label, th, .form-item-label');
  const result = {
    invoice_number: '',
    buyer: '',
    seller: '',
    amount: '',
    tax_rate: '',
    tax_amount: '',
    invoice_type: readInvoiceType() || currentInvoiceType || '未知',
    timestamp: new Date().toLocaleString('zh-CN')
  };

  // 字段名映射：label 文本 → 结果 key
  const fieldMap = [
    ['发票号', 'invoice_number'], ['发票号码', 'invoice_number'],
    ['购买方', 'buyer'], ['买方名称', 'buyer'],
    ['销售方', 'seller'], ['卖方名称', 'seller'],
    ['金额', 'amount'], ['价税合计', 'amount'], ['不含税金额', 'amount'],
    ['税率', 'tax_rate'],
    ['税额', 'tax_amount']
  ];

  for (const label of labels) {
    const labelText = (label.textContent || '').trim().replace(/[:：\s*]/g, '');
    for (const [keyword, key] of fieldMap) {
      if (labelText.includes(keyword)) {
        const formItem = label.closest('.el-form-item') || label.parentElement;
        if (formItem) {
          const input = formItem.querySelector('input, .el-input__inner, textarea');
          if (input && !result[key]) {
            result[key] = (input.value || '').trim();
          }
        }
        break;
      }
    }
  }

  console.log('[发票检查 v3.0.39] 收集到表单数据:', JSON.stringify(result));
  return result;
}

/**
 * 提交校验任务到 Python 后台
 * 发送 /verify 接口，包含文件 + 表单填写数据
 * Python 端会用 AI 重新识别 PDF，然后对比填写值 vs 识别值
 *
 * @param {string} fileName - 附件文件名
 * @param {string} fileData - base64 编码的文件内容
 * @param {object} formData - 用户填写的表单数据
 */
async function submitVerifyTask(fileName, fileData, formData) {
  const taskId = 'v_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
  verifyingCount++;
  verifiedTotal++;

  // 入队
  verifyQueue.push({ id: taskId, fileName, fileData, formData, status: 'pending' });

  // 更新浮标进度显示
  updateVerifyProgressUI();

  try {
    // v3.0.37: 加 keepalive 确保【确定】关闭弹窗/页面卸载时请求仍能送达 Python（不被浏览器取消）
    const resp = await fetch(PS.replace('/check-invoice', '/verify'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
      body: JSON.stringify({
        file_data: fileData,
        file_name: fileName,
        form_data: formData,
        mode: 'compare'  // 告诉 Python 这是"填写值 vs AI识别值"对比模式
      })
    });

    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const result = await resp.json();

    // 从队列中标记完成
    const task = verifyQueue.find(t => t.id === taskId);
    if (task) task.status = 'done';

    verifyingCount--;

    // 存储报告文本（合并多份报告）
    const reportText = formatVerifyReport(taskId, fileName, formData, result);
    verifyReports[taskId] = { text: reportText, timestamp: Date.now(), data: result };
    // v3.0.37: 持久化到本地，防止弹窗关闭/页面刷新后报告丢失（跨页面可恢复）
    saveVerifyReportsToStorage();

    console.log('[发票检查 v3.0.39] 校验完成:', taskId, result.error ? result.error : 'OK');

    // 更新 UI
    updateVerifyProgressUI();
    showNotify('校验完成', `「${fileName}」已校验完毕`);
  } catch (err) {
    console.error('[发票检查 v3.0.39] 校验请求失败:', err);
    const task = verifyQueue.find(t => t.id === taskId);
    if (task) task.status = 'error';
    verifyingCount--;
    updateVerifyProgressUI();
  }
}

/**
 * 格式化校验报告为可读 TXT 文本
 * 对比每个字段的"填写值"和"AI识别值"，标注是否一致
 */
function formatVerifyReport(taskId, fileName, formData, aiResult) {
  const lines = [];
  lines.push('=' .repeat(60));
  lines.push('  发票校验报告');
  lines.push('  生成时间: ' + new Date().toLocaleString('zh-CN'));
  lines.push('  任务ID: ' + taskId);
  lines.push('=' .repeat(60));
  lines.push('');
  lines.push('【附件】' + fileName);
  lines.push('【发票类型】' + (formData.invoice_type || '未知'));
  lines.push('【填写时间】' + (formData.timestamp || '-'));
  lines.push('');
  lines.push('-'.repeat(50));
  lines.push('  字段对比结果');
  lines.push('-'.repeat(50));

  // 对比字段定义：{显示名, 填写值key, AI返回值key}
  const compareFields = [
    { label: '发票号', formKey: 'invoice_number', aiKey: 'invoice_number' },
    { label: '购买方', formKey: 'buyer', aiKey: 'invoice_buyer' },
    { label: '销售方', formKey: 'seller', aiKey: 'invoice_seller' },
    { label: '金额', formKey: 'amount', aiKey: 'amount' },
    { label: '税率', formKey: 'tax_rate', aiKey: 'tax_rate' },
    { label: '税额', formKey: 'tax_amount', aiKey: 'tax_amount' }
  ];

  let passCount = 0, failCount = 0, skipCount = 0;

  for (const field of compareFields) {
    const formVal = (formData[field.formKey] || '(未填写)').trim();
    const aiVal = (aiResult[field.aiKey] || '(AI未识别)').trim();
    const match = formVal && aiVal && formVal !== '(未填写)' && aiVal !== '(AI未识别)'
      ? normalizeCompare(formVal, aiVal)
      : null;

    lines.push('');
    lines.push('  ▸ ' + field.label);
    lines.push('    填写值: ' + formVal);
    lines.push('    识别值: ' + aiVal);

    if (match === true) {
      lines.push('    结果: ✅ 一致');
      passCount++;
    } else if (match === false) {
      lines.push('    结果: ❌ 不一致 ⚠️');
      failCount++;
    } else {
      lines.push('    结果: ➖ 无法比对');
      skipCount++;
    }
  }

  lines.push('');
  lines.push('-'.repeat(50));
  lines.push('  汇总');
  lines.push('-'.repeat(50));
  lines.push('  ✅ 一致: ' + passCount);
  lines.push('  ❌ 不一致: ' + failCount);
  lines.push('  ➖ 无法比对: ' + skipCount);
  lines.push('');
  if (failCount > 0) {
    lines.push('  ⚠️ 有 ' + failCount + ' 个字段不一致，请复核！');
  } else if (failCount === 0 && passCount > 0) {
    lines.push('  🎉 所有可比对字段均一致！');
  }
  lines.push('');
  lines.push('=' .repeat(60));

  return lines.join('\n');
}

/**
 * 归一化比较两个值是否语义一致
 * 处理空格、大小写、常见格式差异（如带¥符号、千分位逗号等）
 */
function normalizeCompare(val1, val2) {
  if (!val1 || !val2) return null;
  // 统一处理：去空白、去¥/$符号、去千分位逗号、转小写
  const norm = s => (s || '').toString()
    .replace(/[\s¥￥$,\u3000]/g, '')
    .replace(/\.(?=\d{3})/g, '') // 可能的格式问题
    .toLowerCase()
    .trim();
  const n1 = norm(val1), n2 = norm(val2);
  if (!n1 || !n2) return null;
  // 完全一致
  if (n1 === n2) return true;
  // 数字比较（处理精度差异如 100.00 vs 100）
  if (!isNaN(Number(n1)) && !isNaN(Number(n2))) {
    return Math.abs(Number(n1) - Number(n2)) < 0.02; // 允许2分钱误差
  }
  // 包含关系（如 "某某有限公司" 包含 "某某公司"）
  if (n1.includes(n2) || n2.includes(n1)) return true;
  return false;
}

/**
 * 更新浮标上的校验进度显示
 * 显示正在校验数量 / 报告下载按钮
 */
function updateVerifyProgressUI() {
  const fw = document.getElementById('ic-floating-widget');
  if (!fw) return;

  const progressEl = fw.querySelector('#ic-verify-progress');
  const reportBtn = fw.querySelector('#ic-report-btn');

  if (progressEl) {
    if (verifyingCount > 0) {
      progressEl.style.display = '';
      progressEl.textContent = '🔍 校验中 ' + verifyingCount + '项...';
      progressEl.style.color = '#ffe4b3'; // 橙色表示进行中
    } else if (Object.keys(verifyReports).length > 0) {
      progressEl.style.display = '';
      progressEl.textContent = '✓ ' + Object.keys(verifyReports).length + '份报告';
      progressEl.style.color = '#a8ffaa'; // 绿色表示已完成
    } else {
      progressEl.style.display = 'none';
    }
  }

  // 有报告时显示下载按钮
  if (reportBtn) {
    reportBtn.style.display = Object.keys(verifyReports).length > 0 ? '' : 'none';
  }
}

/**
 * 持久化校验报告到 chrome.storage.local
 * v3.0.37: 防止弹窗关闭/页面刷新后报告丢失（跨页面/重开浏览器可恢复）
 * 依赖 manifest.json 的 "storage" 权限
 */
function saveVerifyReportsToStorage() {
  try {
    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) return;
    // 直接存全量对象，结构同内存中的 verifyReports = {taskId: {text, timestamp, data}}
    chrome.storage.local.set({ ic_verify_reports: verifyReports });
  } catch (e) {
    console.error('[发票检查 v3.0.39] 报告持久化失败:', e);
  }
}

/**
 * 从 chrome.storage.local 恢复历史校验报告
 * v3.0.37: 浮标初始化时调用，确保刷新/重开页面后📋报告按钮不丢
 * 合并策略：内存中最新报告优先，storage 中的历史报告补充
 */
function loadVerifyReportsFromStorage() {
  try {
    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) return;
    chrome.storage.local.get(['ic_verify_reports'], (res) => {
      const saved = res.ic_verify_reports;
      if (saved && typeof saved === 'object' && Object.keys(saved).length > 0) {
        verifyReports = Object.assign({}, saved, verifyReports);
        updateVerifyProgressUI(); // 恢复📋按钮和进度显示
        console.log('[发票检查 v3.0.39] 已从本地恢复', Object.keys(verifyReports).length, '份历史报告');
      }
    });
  } catch (e) {
    console.error('[发票检查 v3.0.39] 报告恢复失败:', e);
  }
}

/**
 * 显示校验报告预览窗口
 * 深色主题弹窗，包含报告内容预览 + 复制 + 下载按钮
 */
function showVerifyReportPreview() {
  // 合并所有报告
  const reportIds = Object.keys(verifyReports);
  if (reportIds.length === 0) return;

  const fullText = reportIds.map(id => verifyReports[id].text).join('\n\n');

  // 移除已有的预览窗口
  const old = document.getElementById('ic-report-preview');
  if (old) old.remove();

  const preview = document.createElement('div');
  preview.id = 'ic-report-preview';
  preview.style.cssText =
    'position:fixed;top:0;left:0;width:100%;height:100%;z-index:2147483647;'
    + 'background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;'
    + 'backdrop-filter:blur(4px);font-family:"Microsoft YaHei",sans-serif';

  preview.innerHTML =
    '<div style="background:#1e1e2e;color:#e0e0e0;border-radius:12px;box-shadow:0 8px 40px rgba(0,0,0,.5);'
    +  'max-width:680px;width:90%;max-height:80vh;display:flex;flex-direction:column">'
    // 标题栏
    + '<div style="display:flex;align-items:center;justify-content:space-between;padding:14px 18px;border-bottom:1px solid rgba(255,255,255,.08)">'
    +   '<div style="font-size:15px;font-weight:600">📋 发票校验报告</div>'
    +   '<span id="ic-report-close" style="cursor:pointer;font-size:20px;opacity:.6;transition:opacity .2s;line-height:1"'
    +     'onmouseover="this.opacity=1" onmouseout="this.opacity=.6">&times;</span>'
    + '</div>'
    // 内容区
    + '<div id="ic-report-content" style="padding:16px 18px;overflow:auto;flex:1;font-size:12px;line-height:1.7;white-space:pre-wrap;'
    +  'color:#c8c8d0;word-break:break-all">' + escapeHtml(fullText) + '</div>'
    // 操作栏
    + '<div style="display:flex;gap:10px;padding:12px 18px;border-top:1px solid rgba(255,255,255,.08)'
    +   'justify-content:flex-end">'
    +   '<button id="ic-report-copy" style="background:rgba(103,194,58,.25);color:#67c23a;border:1px solid rgba(103,194,58,.4)'
    +     ';padding:7px 18px;border-radius:6px;cursor:pointer;font-size:12px;transition:all .2s">'
    +     '📋 复制全部</button>'
    +   '<button id="ic-report-download" style="background:rgba(66,153,225,.25);color:#4299e1;border:1px solid rgba(66,153,225,.4)'
    +     ';padding:7px 18px;border-radius:6px;cursor:pointer;font-size:12px;transition:all .2s">'
    +     '⬇️ 下载TXT</button>'
    + '</div></div>';

  document.body.appendChild(preview);

  // 关闭按钮
  preview.querySelector('#ic-report-close').onclick = () => preview.remove();
  // 点击背景关闭
  preview.onclick = (e) => { if (e.target === preview) preview.remove(); };

  // 复制按钮
  preview.querySelector('#ic-report-copy').onclick = async () => {
    try {
      await navigator.clipboard.writeText(fullText);
      const btn = preview.querySelector('#ic-report-copy');
      btn.textContent = '✅ 已复制';
      setTimeout(() => { btn.textContent = '📋 复制全部'; }, 2000);
    } catch (e) {
      alert('复制失败，请手动选择文本复制');
    }
  };

  // 下载按钮 — 生成 Blob 触发下载
  preview.querySelector('#ic-report-download').onclick = () => {
    const blob = new Blob([fullText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = '发票校验报告_' + new Date().toISOString().slice(0, 19).replace(/[T:-]/g, '') + '.txt';
    a.click();
    URL.revokeObjectURL(url);
  };
}

/**
 * HTML转义 — 用于安全地在 DOM 中显示报告原文
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * 显示浏览器通知（替代 alert，不打断用户操作）
 */
function showNotify(title, body) {
  if (Notification.permission === 'granted') {
    new Notification(title, { body, icon: 'icon128.png' });
  }
  chrome.runtime.sendMessage({ action: 'notify', title, message: body }).catch(() => {});
}

// v2.5.14-fix: 移除拖拽监听器（deactivate 时调用）
function removeFloatListeners() {
  if (_floatMoveHandler) { document.removeEventListener('mousemove', _floatMoveHandler); _floatMoveHandler = null; }
  if (_floatUpHandler) { document.removeEventListener('mouseup', _floatUpHandler); _floatUpHandler = null; }
}

// ====== 监听消息 ======
chrome.runtime.onMessage.addListener((req, sender, resp) => {
  if (req.action === 'activate') {
    activate();
    resp({ ok: true });
  } else if (req.action === 'deactivate') {
    deactivate();
    resp({ ok: true });
  } else if (req.action === 'show_warning') {
    showWarning(req.selectedType, req.detectedType);
    resp({ ok: true });
  }
});

window.addEventListener('popstate', () => {
  if (isInvoicePage()) { activate(); } else { deactivate(); }
});


// =====================================================
// v2.5.0+ 新增：新增明细 - 自动从附件发票识别并填写金额
// v2.5.10: 移除hasUploadedFile()运行时检查，增强drawer查找
// =====================================================

// detailDialogFilled 已在顶部声明

/**
 * v2.5.21: 自动查找并点击"新增明细"按钮
 * 核心修复: 用 userManuallyOpenedDetail 标志位判断，不依赖DOM时序检测
 * 返回 true=已处理(点击成功或用户已手动打开), false=未找到按钮且弹窗未打开
 */
function clickAddDetailButton() {
  // v2.5.21: 用户已经手动点过"新增明细"，绝对不能再点！
  if (userManuallyOpenedDetail) {
    console.log('[发票检查 v2.5] 用户已手动打开明细弹窗(userManuallyOpenedDetail=true)，跳过按钮点击');
    // 弹窗还没填过？直接触发填写
    if (!detailDialogFilled && !detailFillInProgress) {
      console.log('[发票检查 v2.5] 手动弹窗尚未填写，直接触发tryFillDetail');
      setTimeout(() => tryFillDetail(), 300);
    }
    return true;
  }

  // 用户没手动开 → 尝试自动点击
  const buttons = document.querySelectorAll('button');
  for (const btn of buttons) {
    const btnText = (btn.textContent || '').trim();
    if (btnText === '新增明细' && !btn.disabled && !btn.classList.contains('is-disabled')) {
      console.log('[发票检查 v2.5] 自动点击"新增明细"按钮');
      btn.click();
      return true;
    }
  }
  console.warn('[发票检查 v2.5] 未找到可用的"新增明细"按钮');
  return false;
}

/**
 * 监听"新增明细"按钮点击
 * v2.5.10: 仅检查lastCapturedFile，不再检查hasUploadedFile()（防止drawer动画误判）
 */
function onClickAddDetail(e) {
  const btn = e.target.closest('button');
  if (!btn) return;
  const btnText = (btn.textContent || '').trim();
  if (btnText !== '新增明细') return;

  console.log('[发票检查 v2.5] 点击了"新增明细"按钮');
  // v2.5.21: 标记用户手动打开，防止doCheck完成后重复点击
  userManuallyOpenedDetail = true;
  console.log('[发票检查 v2.5] 诊断: lastCapturedFile=' + (lastCapturedFile ? lastCapturedFile.fileName : 'null') + ', hasUploadedFile=' + hasUploadedFile() + ', detailDialogFilled=' + detailDialogFilled + ', detailFillInProgress=' + detailFillInProgress);

  // v2.5.10: 仅用lastCapturedFile判断，不依赖hasUploadedFile()
  if (!lastCapturedFile) {
    console.log('[发票检查 v2.5] 无附件(lastCapturedFile=null)，不触发自动填金额');
    detailDialogFilled = false;
    return;
  }

  detailDialogFilled = false;

  // v3.0.20: 实时检查弹窗内是否已有明细数据行（capture阶段执行，此时看到的是点击前的状态）
  //   - 弹窗未打开或弹窗内无数据行 → 这是"第一条" → 触发识别
  //   - 弹窗内已有数据行 → 这是"追加" → 跳过识别
  const existingDialog = findDetailDialog();
  if (existingDialog) {
    // v3.0.22: 多选择器覆盖不同 Element UI 表格结构
    //   - .el-table__body-wrapper tbody tr  → 经典 Element UI 包裹结构
    //   - .el-table__body tbody tr          → 无 wrapper 的简写结构
    //   - .el-table tbody tr                → 表格在 .el-table 名下
    //   - .el-table tr.el-table__row        → 直接找行（最宽泛的匹配）
    //   - table tbody tr                    → 兜底：任意 table 内的行
    const rowSelectors = [
      '.el-table__body-wrapper tbody tr',
      '.el-table__body tbody tr',
      '.el-table tbody tr',
      '.el-table tr.el-table__row',
      'table tbody tr.el-table__row',
      'table tbody tr',
    ];
    let dataRows = [];
    for (const sel of rowSelectors) {
      const rows = existingDialog.querySelectorAll(sel);
      const filtered = Array.from(rows).filter(r => {
        const t = (r.textContent || '').trim();
        return t && t !== '暂无数据' && !t.includes('暂无数据');
      });
      if (filtered.length > 0) {
        dataRows = filtered;
        console.log('[发票检查 v3.0] 选择器 ' + sel + ' 匹配到 ' + filtered.length + ' 行');
        break;
      }
    }
    if (dataRows.length > 0) {
      console.log('[发票检查 v3.0] onClickAddDetail: 弹窗已有 ' + dataRows.length + ' 条明细，本次为追加，跳过识别');
      detailDialogFilled = true;
      return;
    }
    // 诊断：找不到行时打印弹窗内所有 table 元素，帮助定位
    const allTables = existingDialog.querySelectorAll('table');
    console.log('[发票检查 v3.0] onClickAddDetail: 弹窗内无明细数据行（弹窗内 table 数量: ' + allTables.length + '）');
    allTables.forEach((t, i) => {
      const tRows = t.querySelectorAll('tbody tr');
      console.log('[发票检查 v3.0]   table[' + i + '] class=' + t.className + ' tbody tr数=' + tRows.length);
      tRows.forEach((r, j) => {
        console.log('[发票检查 v3.0]     tr[' + j + '] class=' + r.className + ' text=' + (r.textContent || '').trim().substring(0, 80));
      });
    });
    // 检查是否有 div 模拟的表格行（某些 UI 框架不使用 <table>）
    const divRows = existingDialog.querySelectorAll('[class*="row"][class*="table"], [class*="row"][class*="detail"]');
    console.log('[发票检查 v3.0]   div模拟行数量: ' + divRows.length);
    divRows.forEach((d, i) => {
      console.log('[发票检查 v3.0]     div[' + i + '] class=' + d.className + ' text=' + (d.textContent || '').trim().substring(0, 80));
    });
    console.log('[发票检查 v3.0] onClickAddDetail: 弹窗内无明细数据，作为第一条触发识别');
  } else {
    // v3.0.23: 弹窗未找到 → 检查页面上是否有固定位置的明细表格
    //   (付款申请→录入新发票的明细表格在页面固定位置，不在弹窗内)
    const pageTable = findDetailTableOnPage();
    if (pageTable) {
      const hasData = checkDetailTableHasData(pageTable);
      if (hasData) {
        console.log('[发票检查 v3.0] onClickAddDetail: 页面表格已有明细数据，跳过识别');
        detailDialogFilled = true;
        return;
      }
      console.log('[发票检查 v3.0] onClickAddDetail: 页面表格无明细数据，作为第一条触发识别');
    } else {
      console.log('[发票检查 v3.0] onClickAddDetail: 弹窗未打开且页面无明细表格，作为第一条触发识别');
    }
  }
  setTimeout(() => tryFillDetail(), 600);
}

/**
 * v3.0.20: 监听明细行删除 — 删光后重置 detailDialogFilled，下次新增由 onClickAddDetail 实时判断
 */
function onDetailDelete(e) {
  const btn = e.target.closest('button');
  if (!btn) return;
  const btnText = (btn.textContent || '').trim();
  if (btnText !== '删除') return;

  setTimeout(() => {
    const dialog = findDetailDialog();
    if (!dialog) return;

    const rows = dialog.querySelectorAll('.el-table__body-wrapper tbody tr, .el-table__body tbody tr');
    const dataRows = Array.from(rows).filter(r => {
      const t = (r.textContent || '').trim();
      return t && t !== '暂无数据';
    });

    console.log('[发票检查 v3.0] 检测到删除操作，剩余明细行数: ' + dataRows.length);

    if (dataRows.length === 0 && detailDialogFilled) {
      console.log('[发票检查 v3.0] 所有明细已删除 → 重置 detailDialogFilled');
      detailDialogFilled = false;
    }
  }, 400);
}

/**
 * MutationObserver 回调中检测"新增明细"弹窗出现
 * v2.5.24: 只有用户手动进入阶段2(点"新增明细")后才允许自动触发明细填写
 *          阶段1(上传发票)期间禁止自动触发，防止误操作
 */
function detectDetailDialog() {
  // v2.5.10: 仅检查lastCapturedFile
  if (!lastCapturedFile) return;
  if (detailDialogFilled) return;
  if (detailFillInProgress) return;
  // v2.5.24: 阶段1（用户还没点"新增明细"）不允许自动触发明细填写
  if (!userManuallyOpenedDetail) return;
  // v3.0.13: 防抖 — MutationObserver每次DOM变化都触发此函数，限制1秒内最多1次
  const now = Date.now();
  if (detectDetailDialog._lastFire && now - detectDetailDialog._lastFire < 1000) return;

  const dialog = findDetailDialog();
  if (dialog) {
    detectDetailDialog._lastFire = now;
    tryFillDetail();
  }
}

/**
 * v2.5.10: 查找"新增明细/新增应付费"弹窗 - 增强兼容性
 * 1. 查找标题元素含"新增明细"或"新增应付费"
 * 2. 兜底：查找含"蓝票金额"/"面额金额"/"开票金额"表单项的可见drawer/dialog
 */
/**
 * v3.0.23: 在页面上（非弹窗内）查找明细表格
 * 用于付款申请→录入新发票等明细表格在页面固定位置的场景
 * 通过"序号"列头定位表格
 */
function findDetailTableOnPage() {
  const tables = document.querySelectorAll('.el-table');
  for (const table of tables) {
    // 跳过弹窗/抽屉内的表格（那些由 findDetailDialog 处理）
    if (table.closest('.el-dialog__wrapper, .el-dialog, .el-drawer__wrapper, .el-drawer')) continue;
    // 查找"序号"列头
    const headers = table.querySelectorAll('.el-table__header-wrapper th');
    for (const th of headers) {
      const text = (th.textContent || '').trim();
      if (text === '序号') {
        console.log('[发票检查 v3.0] findDetailTableOnPage: 找到页面级明细表格');
        return table;
      }
    }
  }
  return null;
}

/**
 * v3.0.23: 检查明细表格是否已有数据行
 * 通过"序号"列的单元格内容判断（有数据时显示数字如"1""2"，无数据时为空）
 */
function checkDetailTableHasData(table) {
  // 找到"序号"列的索引
  const headers = table.querySelectorAll('.el-table__header-wrapper th');
  let seqColIndex = -1;
  headers.forEach((th, i) => {
    if ((th.textContent || '').trim() === '序号') {
      seqColIndex = i;
    }
  });
  if (seqColIndex === -1) {
    console.log('[发票检查 v3.0] checkDetailTableHasData: 未找到序号列');
    return false;
  }

  // 检查 tbody 中序号列的单元格是否有数字内容
  const rows = table.querySelectorAll('.el-table__body-wrapper tbody tr, .el-table__body tbody tr');
  for (const row of rows) {
    // 跳过表头行（某些实现中 thead 也用 tr）
    const cells = row.querySelectorAll('td');
    if (cells.length > seqColIndex) {
      const cellText = (cells[seqColIndex].textContent || '').trim();
      if (cellText && /^\d+$/.test(cellText)) {
        console.log('[发票检查 v3.0] checkDetailTableHasData: 序号列有数据 "' + cellText + '" → 表格已有明细');
        return true;
      }
    }
  }
  console.log('[发票检查 v3.0] checkDetailTableHasData: 序号列无数字 → 表格为空');
  return false;
}

// v3.0.13: 轻量版，仅检查明细弹窗是否存在，用于 observer 检测弹窗消失
function findDetailDialogQuick() {
  const dialogs = document.querySelectorAll('.el-dialog__wrapper, .el-dialog, .el-drawer__wrapper, .el-drawer');
  for (const dlg of dialogs) {
    if (dlg.offsetParent === null && !dlg.classList.contains('el-drawer')) continue;
    const header = dlg.querySelector('.el-drawer__header, .el-dialog__header');
    if (!header) continue;
    const ht = (header.textContent || '').trim();
    if (ht.includes('新增明细') || ht.includes('新增应付费') || ht.includes('新增编辑项') || ht.includes('新增应付发票') || ht.includes('录入发票')) return dlg;
  }
  return null;
}

function findDetailDialog() {
  // v2.5.19: 收集所有匹配的弹窗，优先返回含可编辑字段的
  const dialogs = document.querySelectorAll('.el-dialog__wrapper, .el-dialog, .el-drawer__wrapper, .el-drawer');
  const matches = [];

  for (const dlg of dialogs) {
    // 检查可见性
    const isVisible = dlg.offsetParent !== null || dlg.style.display !== 'none' ||
                      dlg.classList.contains('el-drawer__wrapper') || dlg.classList.contains('el-drawer') ||
                      (dlg.classList.contains('el-drawer') && dlg.classList.contains('is-open'));
    if (!isVisible) continue;

    // 查找标题：兼容多种DOM结构，支持"新增明细"和"新增应付费"
    const titleSelectors = '.el-dialog__title, .el-drawer__title, .el-drawer__header span, .el-dialog__header span';
    const titleEl = dlg.querySelector(titleSelectors);
    let titleMatch = false;
    if (titleEl) {
      const titleText = (titleEl.textContent || '').trim();
      if (titleText.includes('新增明细') || titleText.includes('新增应付费') || titleText.includes('新增编辑项') || titleText.includes('新增应付发票') || titleText.includes('录入发票')) {
        titleMatch = true;
      }
    }

    // 也检查header区域整体文本
    const header = dlg.querySelector('.el-drawer__header, .el-dialog__header');
    if (header) {
      const headerText = (header.textContent || '').trim();
      if ((headerText.includes('新增明细') || headerText.includes('新增应付费') || headerText.includes('新增编辑项') || headerText.includes('新增应付发票') || headerText.includes('录入发票')) && headerText.length < 30) {
        titleMatch = true;
      }
    }

    // 方法2：兜底 - 查找含"蓝票金额"/"面额金额"/"开票金额"表单项的drawer
    let fieldMatch = false;
    const labels = dlg.querySelectorAll('.el-form-item__label');
    for (const label of labels) {
      const text = (label.textContent || '').trim().replace(/[*\s]/g, '');
      if (text === '蓝票金额' || text === '面额金额' || text === '开票金额') {
        fieldMatch = true;
        break;
      }
    }

    if (titleMatch || fieldMatch) {
      // 检查是否有可编辑的input（非disabled）
      const hasEditableInput = dlg.querySelector('input:not([disabled]):not([readonly])');
      matches.push({ dlg, titleMatch, fieldMatch, hasEditableInput });
    }
  }

  if (matches.length === 0) return null;

  // 优先级：titleMatch + hasEditableInput > fieldMatch + hasEditableInput > 任意匹配
  matches.sort((a, b) => {
    const aScore = (a.titleMatch ? 2 : 0) + (a.hasEditableInput ? 1 : 0);
    const bScore = (b.titleMatch ? 2 : 0) + (b.hasEditableInput ? 1 : 0);
    return bScore - aScore;  // 降序，分数高的优先
  });

  console.log('[发票检查 v2.5] findDetailDialog: 找到' + matches.length + '个匹配弹窗，选择得分最高的（可编辑=' + matches[0].hasEditableInput + '）');
  return matches[0].dlg;
}

/**
 * v2.5.8 核心：setInputValue - 向上遍历DOM找Vue实例，用$emit设值
 * v2.5.19 修复：总是立即原生设值，Vue $emit 仅作补充；增加验证+重试
 * v3.0.15 修复：InputEvent替代Event + 原生setter + 二次forceSet防Vue mount覆盖
 *   根因：Vue 2 mount 时会用空 model 值覆盖原生 input.value
 *   方案：使用 Object.getOwnPropertyDescriptor 原生setter绕过Vue拦截
 *         300ms后二次forceSet确保mount后值仍存在
 */
function setInputValue(input, value) {
  console.log('[发票检查 v3.0] setInputValue: 目标值=' + value + ', input.tagName=' + (input.tagName || '?') + ', input.className=' + (input.className || '?'));

  // v3.0.16: 策略A — 直接操作 ElInput Vue 组件实例（最可靠）
  // Element UI 的 el-input 组件根元素是 .el-input，找它的 __vue__ 实例
  const elInputWrapper = input.closest('.el-input');
  if (elInputWrapper && elInputWrapper.__vue__) {
    const vueComp = elInputWrapper.__vue__;
    // 检查是否有 reactive value 属性
    if (vueComp.hasOwnProperty('value') || 'value' in vueComp) {
      try {
        vueComp.value = value;
        // 同时手动触发 input 事件确保父组件 v-model 感知
        if (typeof vueComp.$emit === 'function') {
          vueComp.$emit('input', value);
        }
        console.log('[发票检查 v3.0] ✓ ElInput Vue组件 value 已设置: ' + value);
        // 短暂延迟后验证
        return new Promise((resolve) => {
          setTimeout(() => {
            console.log('[发票检查 v3.0] ElInput 验证: input.value=' + input.value + ', vueComp.value=' + vueComp.value);
            resolve(true);
          }, 200);
        });
      } catch (e) {
        console.warn('[发票检查 v3.0] ElInput Vue 设值异常:', e.message);
      }
    }
  }

  // v3.0.16: 策略B — 遍历DOM找 __vue__ 实例（回退方案）
  let el = input;
  for (let i = 0; i < 15; i++) {
    if (!el) break;
    const vue = el.__vue__;
    if (vue && typeof vue.$emit === 'function') {
      // 尝试通过 Vue instance 的 $data 或直接属性设值
      try {
        // ElInput 的 value 可能在 $data.value 或实例直接属性上
        if (vue.$data && vue.$data.value !== undefined) {
          vue.$data.value = value;
          vue.$emit('input', value);
          console.log('[发票检查 v3.0] ✓ Vue $data.value 设值, 层级=' + i);
          break;
        } else if (vue.value !== undefined) {
          vue.value = value;
          vue.$emit('input', value);
          console.log('[发票检查 v3.0] ✓ Vue instance.value 设值, 层级=' + i);
          break;
        }
      } catch (e) {
        // 尝试仅 $emit
        try { vue.$emit('input', value); } catch (e2) {}
      }
    }
    el = el.parentElement;
  }

  // v3.0.16: 策略C — DOM 操作（最后的回退方案）
  const nativeValueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype, 'value'
  ).set;

  function forceSet() {
    nativeValueSetter.call(input, value);
    input.dispatchEvent(new FocusEvent('focus', { bubbles: true }));
    input.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true, data: String(value) }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }
  forceSet();

  // 双阶段验证
  return new Promise((resolve) => {
    setTimeout(() => {
      forceSet();
      setTimeout(() => {
        const currentVal = (input.value || '').replace(/,/g, '');
        if (currentVal !== String(value) && currentVal !== String(Number(value))) {
          console.log('[发票检查 v3.0] 验证未通过(input.value=' + input.value + ')，第三次设值');
          forceSet();
        }
        console.log('[发票检查 v3.0] ✓ 最终验证: input.value=' + input.value);
        resolve(true);
      }, 300);
    }, 300);
  });
}

/**
 * v2.5.8: 多级搜索输入框
 */
function findFieldInput(container, fieldLabel) {
  const cleanLabel = fieldLabel.replace(/[*\s]/g, '');

  // 第1级：在当前容器中搜索
  const labels = container.querySelectorAll('.el-form-item__label, label, .ant-form-item-label, th');
  for (const label of labels) {
    const text = (label.textContent || '').trim().replace(/[*\s]/g, '');
    if (text === cleanLabel || text.includes(cleanLabel)) {
      const formItem = label.closest('.el-form-item, .ant-form-item, tr, .form-group, .form-item');
      if (formItem) {
        const inputs = formItem.querySelectorAll('input[type="text"], input:not([type]), input[type="number"], input[type="tel"], textarea');
        for (const inp of inputs) {
          if (!inp.disabled && !inp.readOnly) {
            return inp;
          }
        }
      }
    }
  }

  // 第2级：在所有可见弹窗/抽屉中搜索
  const allDialogs = document.querySelectorAll('.el-dialog__wrapper, .el-dialog, .el-drawer__wrapper, .el-drawer');
  for (const dlg of allDialogs) {
    if (dlg === container) continue;
    if (dlg.offsetParent === null && dlg.style.display === 'none') continue;
    const dlgLabels = dlg.querySelectorAll('.el-form-item__label, label, .ant-form-item-label, th');
    for (const label of dlgLabels) {
      const text = (label.textContent || '').trim().replace(/[*\s]/g, '');
      if (text === cleanLabel || text.includes(cleanLabel)) {
        const formItem = label.closest('.el-form-item, .ant-form-item, tr, .form-group, .form-item');
        if (formItem) {
          const inputs = formItem.querySelectorAll('input[type="text"], input:not([type]), input[type="number"], input[type="tel"], textarea');
          for (const inp of inputs) {
            if (!inp.disabled && !inp.readOnly) {
              return inp;
            }
          }
        }
      }
    }
  }

  // 第3级：全局搜索
  const globalLabels = document.querySelectorAll('.el-form-item__label, label, .ant-form-item-label, th');
  for (const label of globalLabels) {
    const text = (label.textContent || '').trim().replace(/[*\s]/g, '');
    if (text === cleanLabel || text.includes(cleanLabel)) {
      const formItem = label.closest('.el-form-item, .ant-form-item, tr, .form-group, .form-item');
      if (formItem) {
        const inputs = formItem.querySelectorAll('input[type="text"], input:not([type]), input[type="number"], input[type="tel"], textarea');
        for (const inp of inputs) {
          if (inp.offsetParent !== null && !inp.disabled && !inp.readOnly) {
            return inp;
          }
        }
      }
    }
  }

  // 第4级：表格行结构 — 字段名作为 <td> 纯文本，输入框在同行其他 <td> 中
  //   (付款申请→录入新发票等页面级明细表格使用此结构)
  //   例如: <tr><td>蓝票金额</td><td><input value=""/></td></tr>
  const allTableRows = document.querySelectorAll('table tbody tr, .el-table__body tr');
  for (const row of allTableRows) {
    const cells = row.querySelectorAll('td');
    for (const cell of cells) {
      const text = (cell.textContent || '').trim().replace(/[*\s]/g, '');
      if (text === cleanLabel) {
        // 找到字段名所在的 cell，然后在整个 row 中搜索可编辑 input
        const inputs = row.querySelectorAll('input[type="text"], input:not([type]), input[type="number"], input[type="tel"], textarea');
        for (const inp of inputs) {
          if (inp.offsetParent !== null && !inp.disabled && !inp.readOnly) {
            console.log('[发票检查 v3.0] findFieldInput L4(table-row): 在行内找到 ' + fieldLabel + ' 对应输入框');
            return inp;
          }
        }
        // 如果该 cell 本身包含 input（如 inline 编辑），直接返回
        const cellInputs = cell.querySelectorAll('input[type="text"], input:not([type]), input[type="number"], input[type="tel"], textarea');
        for (const inp of cellInputs) {
          if (inp.offsetParent !== null && !inp.disabled && !inp.readOnly) {
            console.log('[发票检查 v3.0] findFieldInput L4(inline): 在字段cell内找到 ' + fieldLabel + ' 对应输入框');
            return inp;
          }
        }
      }
    }
  }

  return null;
}

/**
 * v2.5.8: 多级搜索下拉选择框
 */
function findFieldSelect(container, fieldLabel) {
  const cleanLabel = fieldLabel.replace(/[*\s]/g, '');

  const labels = container.querySelectorAll('.el-form-item__label, label, .ant-form-item-label, th');
  for (const label of labels) {
    const text = (label.textContent || '').trim().replace(/[*\s]/g, '');
    if (text === cleanLabel || text.includes(cleanLabel)) {
      const formItem = label.closest('.el-form-item, .ant-form-item, tr, .form-group, .form-item');
      if (formItem) {
        const select = formItem.querySelector('.el-select, .ant-select');
        if (select) return select;
      }
    }
  }

  const allDialogs = document.querySelectorAll('.el-dialog__wrapper, .el-dialog, .el-drawer__wrapper, .el-drawer');
  for (const dlg of allDialogs) {
    if (dlg === container) continue;
    if (dlg.offsetParent === null && dlg.style.display === 'none') continue;
    const dlgLabels = dlg.querySelectorAll('.el-form-item__label, label, .ant-form-item-label, th');
    for (const label of dlgLabels) {
      const text = (label.textContent || '').trim().replace(/[*\s]/g, '');
      if (text === cleanLabel || text.includes(cleanLabel)) {
        const formItem = label.closest('.el-form-item, .ant-form-item, tr, .form-group, .form-item');
        if (formItem) {
          const select = formItem.querySelector('.el-select, .ant-select');
          if (select) return select;
        }
      }
    }
  }

  // L4: 表格行结构 — 字段名作为 <td> 纯文本，下拉框在同行
  const allTableRows2 = document.querySelectorAll('table tbody tr, .el-table__body tr');
  for (const row of allTableRows2) {
    const cells = row.querySelectorAll('td');
    for (const cell of cells) {
      const text = (cell.textContent || '').trim().replace(/[*\s]/g, '');
      if (text === cleanLabel) {
        const select = row.querySelector('.el-select, .ant-select');
        if (select) return select;
        const cellSelect = cell.querySelector('.el-select, .ant-select');
        if (cellSelect) return cellSelect;
      }
    }
  }

  return null;
}

/**
 * v2.5.14-fix: 税率标签匹配（统一逻辑，修复旧版换算 bug）
 * @param {string} optLabel 下拉选项显示文本
 * @param {string} rateStr  原始税率串，如 "13%" / "6%"
 * @param {string} rateNum  去掉%后的数字串，如 "13" / "6" / "1.5"
 * @param {number|null} rateDecimal 小数形式值，如 0.13 / 0.06 / 0.015
 * 兼容以下选项写法: "13%" / "13" / "0.13" / "0.13%" / ".13"
 */
function matchRateLabel(optLabel, rateStr, rateNum, rateDecimal) {
  if (!optLabel) return false;
  // 1. 完全相等: "13%" / "13"
  if (optLabel === rateStr || optLabel === rateNum) return true;
  // 2. 带/不带空格的百分号: "13 %" / "6 %"
  if (optLabel === rateNum + '%' || optLabel === rateNum + ' %') return true;
  // 3. 小数形式: rateDecimal 为 null（rateNum 解析失败）时跳过
  if (rateDecimal !== null && !isNaN(rateDecimal)) {
    // "0.13" / "0.06" / "0.015" — 用 toFixed 后逐位比较，避免浮点精度
    // 13% → 0.13, 选项可能写作 "0.13" 或 ".13"
    const dec2 = rateDecimal.toFixed(2);  // 0.13
    const decFull = String(rateDecimal);   // 0.13 / 0.06 / 0.015
    if (optLabel === dec2 || optLabel === decFull || optLabel === decFull.replace(/^0\./, '.')) return true;
  }
  return false;
}

/**
 * v2.5.8: 选择下拉框中匹配的选项
 * 优先Vue $emit，兜底DOM点击
 * v2.5.14-fix: 修复税率小数形式换算错误
 *   旧逻辑 '0.0'+rateNum 对两位数税率(13)产生 '0.013' 永远匹配不上
 *   新逻辑: rateNum/100 正确换算 13→0.13, 6→0.06, 1.5→0.015
 */
async function selectDropdownOption(selectEl, rateStr) {
  const rateNum = rateStr.replace('%', '').trim();
  const rateVal = parseFloat(rateNum);
  // 正确的小数形式换算: 13 → 0.13, 6 → 0.06, 1.5 → 0.015
  const rateDecimal = isNaN(rateVal) ? null : (rateVal / 100);
  console.log('[发票检查 v2.5] 选择税率下拉: rateStr=' + rateStr + ', rateNum=' + rateNum + ', rateDecimal=' + rateDecimal);

  // 方式1: 找到el-select的Vue实例，通过$emit设值
  let el = selectEl;
  for (let i = 0; i < 15; i++) {
    if (!el) break;
    const vue = el.__vue__;
    if (vue && typeof vue.$emit === 'function') {
      if (!openDropdown(selectEl)) break;
      await sleep(500);

      let options = [];
      try {
        if (vue.options && Array.isArray(vue.options)) {
          options = vue.options;
        } else if (vue.$children) {
          for (const child of vue.$children) {
            if (child.$options && child.$options.name === 'ElOption') {
              options.push({ value: child.value, label: child.label || (child.$el ? child.$el.textContent.trim() : '') });
            }
          }
        }
      } catch(e) {
        console.warn('[发票检查 v2.5] Vue选项获取异常:', e);
      }

      if (options.length > 0) {
        for (const opt of options) {
          const optLabel = String(opt.label || '').trim();
          const optValue = opt.value;
          if (matchRateLabel(optLabel, rateStr, rateNum, rateDecimal)) {
            console.log('[发票检查 v2.5] Vue匹配到选项: label=' + optLabel + ', value=' + optValue);
            vue.$emit('input', optValue);
            await sleep(100);
            vue.$emit('change', optValue);
            closeDropdown();
            return true;
          }
        }
        console.warn('[发票检查 v2.5] Vue选项中未匹配到税率:', rateStr, '选项列表:', options.map(o => o.label));
      }

      break;
    }
    el = el.parentElement;
  }

  // 方式2: DOM点击选项
  if (!openDropdown(selectEl)) return false;

  await sleep(500);

  const allDropdowns = document.querySelectorAll('.el-select-dropdown.el-popper');
  let lastVisibleDropdown = null;
  for (const dd of allDropdowns) {
    if (dd.style.display !== 'none' && dd.offsetParent !== null) {
      lastVisibleDropdown = dd;
    }
  }

  const searchRoot = lastVisibleDropdown || document;
  const options = searchRoot.querySelectorAll('.el-select-dropdown__item:not(.is-disabled)');
  for (const opt of options) {
    const optText = (opt.textContent || '').trim();
    if (matchRateLabel(optText, rateStr, rateNum, rateDecimal)) {
      console.log('[发票检查 v2.5] DOM点击选项: text=' + optText);
      selectOption(opt);
      await sleep(200);
      closeDropdown();
      return true;
    }
  }
  console.warn('[发票检查 v2.5] DOM选项中未匹配到税率:', rateStr);
  closeDropdown();
  return false;
}

/**
 * v2.5.26: 智能判断专票是否应跳过税率自动选择
 * 跳过条件(满足任一即跳过):
 *   1. 后端明确标记 is_multi_rate=true
 *   2. 税率值不是中国增值税标准税率 → 视为多税率混合或异常值
 *
 * 标准税率列表: 0%, 1%, 3%, 5%, 6%, 9%, 11%, 13% (覆盖全部历史+现行增值税率)
 * @param {Object} data - extract-detail API返回结果
 * @returns {boolean} true=跳过税率, false=正常选税率
 */
function shouldSkipTaxRate(data) {
  // 条件1: 后端明确标记多税率
  // v2.5.30: 但如果后端同时提供了 tax_rates 清单且所有税率是同一档，则不跳过，直接选
  if (data.is_multi_rate) {
    if (data.tax_rates && Array.isArray(data.tax_rates) && data.tax_rates.length > 0) {
      const allSame = data.tax_rates.every(r => String(r) === String(data.tax_rates[0]));
      if (allSame) {
        console.log('[发票检查 v2.5] is_multi_rate=true 但 tax_rates 所有值相同(' + data.tax_rates[0] + ')，不跳过');
        return false;
      }
    }
    console.log('[发票检查 v2.5] shouldSkipTaxRate: is_multi_rate=true，税率不统一 → 跳过');
    return true;
  }

  // 条件2: 税率值非标准 → 视为可疑（多税率的加权平均、或误识别）
  if (data.tax_rate) {
    // 标准增值税率白名单（整数百分比形式）
    const standardRates = [0, 1, 3, 5, 6, 9, 11, 13];
    const rateStr = String(data.tax_rate).replace('%', '').trim();
    const rateNum = parseFloat(rateStr);
    if (!isNaN(rateNum)) {
      // v3.0.2: 0 < rateNum < 0.5 视为异常（如AI小数点错位 0.009%→应为9%），跳过
      // 不允许误匹配到 0（标准税率），否则会尝试用异常值去匹配下拉框导致"未匹配到选项"
      if (rateNum > 0 && rateNum < 0.5) {
        console.log('[发票检查 v3.0] shouldSkipTaxRate: 疑似小数点错位(' + data.tax_rate + ') → 跳过');
        return true;
      }
      // 允许±0.05的误差（处理浮点数如 5.9999→6）
      const isStandard = standardRates.some(sr => Math.abs(rateNum - sr) < 0.05);
      if (!isStandard) {
        console.log('[发票检查 v2.5] shouldSkipTaxRate: 非标准税率(' + data.tax_rate + ') → 跳过自动选择');
        return true;
      }
    }
  }

  return false;
}

/**
 * 核心逻辑：从附件发票识别金额并自动填入弹窗
 * v2.5.10: 移除hasUploadedFile()入口检查，增强findDetailDialog
 */
async function tryFillDetail() {
  // v3.0.28: 金额&税率开关关闭时跳过明细填写
  if (!icToggleAmount) {
    console.log('[发票检查 v3.0] 金额&税率识别已关闭，跳过明细自动填写');
    return;
  }
  console.log('[发票检查 v2.5] tryFillDetail 被调用: lastCapturedFile=' + (lastCapturedFile ? lastCapturedFile.fileName : 'null') + ', hasFile=' + hasUploadedFile());

  // v2.5.10: 仅检查lastCapturedFile，不检查hasUploadedFile()
  if (!lastCapturedFile) {
    console.log('[发票检查 v2.5] 无附件(lastCapturedFile=null)，跳过明细自动填');
    return;
  }

  // 找弹窗 - 支持重试
  let dialog = findDetailDialog();
  if (!dialog) {
    console.log('[发票检查 v2.5] 未找到弹窗，500ms后重试');
    await sleep(500);
    dialog = findDetailDialog();
  }
  if (!dialog) {
    console.log('[发票检查 v2.5] 重试仍未找到弹窗');
    // v3.0.25: 付款申请→录入新发票等场景，明细表格在页面固定位置不在弹窗内。
    // 尝试找页面级明细表格作为填写容器，让 findFieldInput 全局搜索找到页面上的字段。
    const pageTable = findDetailTableOnPage();
    if (pageTable) {
      // 用表格的父容器作为搜索范围，确保 findFieldInput 的 level-1 能命中
      dialog = pageTable;
      console.log('[发票检查 v3.0] 未找到明细弹窗，使用页面级明细表格作为填写容器');
    } else {
      return;
    }
  }

  if (detailDialogFilled) {
    console.log('[发票检查 v2.5] 当前弹窗已填过，跳过');
    return;
  }

  if (detailFillInProgress) return;

  // v3.0.20: 不再使用 hasFilledFirstDetail 标志位。
  // onClickAddDetail 已在 capture 阶段检查弹窗是否有已有数据行，此处无需重复拦截。

  // v3.0.7: 验证弹窗是否真的包含明细填写字段（蓝票金额/面额金额/开票金额）
  // 防止在非明细弹窗中触发填写（如上传弹窗/列表页等）
  const detailFieldCandidates = ['蓝票金额', '面额金额', '开票金额'];
  let hasDetailField = false;
  for (const fieldName of detailFieldCandidates) {
    if (findFieldInput(dialog, fieldName)) {
      hasDetailField = true;
      console.log('[发票检查 v3.0] 确认明细弹窗存在字段: ' + fieldName);
      break;
    }
  }
  if (!hasDetailField) {
    console.log('[发票检查 v3.0] 弹窗中无明细填写字段（蓝票/面额/开票金额），不是明细弹窗，跳过');
    return;
  }

  detailFillInProgress = true;
  console.log('[发票检查 v2.5] 开始从附件识别发票金额...');

  const invoiceType = readInvoiceType() || currentInvoiceType || '未知';
  console.log('[发票检查 v2.5] 当前发票类型:', invoiceType);

  // v2.5.30: "其他"类型发票无标准格式（可能是聊天截图/表格/收据/合同），跳过金额识别，让用户自己填
  if (invoiceType === '其他') {
    detailFillInProgress = false;
    console.log('[发票检查 v2.5] 发票类型为"其他"，跳过金额自动填写');
    return;
  }

  showDetailLoading(dialog);

  try {
    const resp = await fetch(PS_DETAIL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        file_data: lastCapturedFile.fileData,
        file_name: lastCapturedFile.fileName,
        selected_type: invoiceType
      })
    });

    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const data = await resp.json();

    if (data.error) {
      console.error('[发票检查 v2.5] 金额提取错误:', data.error);
      const curDialog = findDetailDialog() || dialog;
      showDetailTip(curDialog, '⚠️ 发票金额识别失败，请手动填写', 'error');
      detailFillInProgress = false;
      return;
    }

    console.log('[发票检查 v2.5] 金额提取结果:', JSON.stringify(data));

    const currentDialog = findDetailDialog() || dialog;
    let filledItems = [];

    // ===== 填写蓝票/面额/开票金额（兼容"新增明细"和"新增应付费"两种弹窗） =====
    if (data.amount) {
      // 优先尝试多种字段名，兼容不同弹窗类型
      const amountFieldNames = ['蓝票金额', '面额金额', '开票金额'];
      let amountInput = null;
      let matchedFieldName = '';
      for (const fieldName of amountFieldNames) {
        amountInput = findFieldInput(currentDialog, fieldName);
        if (amountInput) {
          matchedFieldName = fieldName;
          console.log('[发票检查 v2.5] 找到金额字段: ' + fieldName);
          break;
        }
      }
      if (amountInput) {
        await setInputValue(amountInput, data.amount);
        await sleep(600);
        // v3.0.21: 模拟金额字段 focus→blur，触发中台系统的联动计算（税额/开票金额）
        // 系统绑定在金额字段 blur 事件上，程序化 setInputValue 不会触发 blur
        amountInput.focus();
        amountInput.dispatchEvent(new FocusEvent('focus', { bubbles: true }));
        await sleep(100);
        amountInput.blur();
        amountInput.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
        console.log('[发票检查 v3.0] 已模拟金额字段 focus+blur 激活系统联动计算');
        await sleep(200);
        if (amountInput.value === String(data.amount) || amountInput.value.replace(/,/g, '') === String(data.amount)) {
          filledItems.push(matchedFieldName + ': ' + data.amount);
          console.log('[发票检查 v2.5] ✓ ' + matchedFieldName + '验证通过:', amountInput.value);
        } else {
          filledItems.push(matchedFieldName + ': ' + data.amount + '（待确认）');
          console.warn('[发票检查 v2.5] ' + matchedFieldName + '验证失败, 当前值:', amountInput.value, '期望:', data.amount);
        }
      }
    }

    // ===== 专票：税率/税额填写规则（v3.0.5） =====
    // 规则2: 单税率 → 自动填税率，不填税额
    // 规则3: 单税率但下拉框无匹配 → 填税额
    // 规则4: 多税率且不同 → 不填税率，填税额
    // 规则5: 多税率且相同 → 自动填税率，不填税额；下拉框无匹配 → 填税额
    if (invoiceType === '专票') {
      const skipTaxRate = shouldSkipTaxRate(data);

      // 确定要尝试填写的税率值（单税率 或 多税率全部相同）
      let rateValue = null;
      if (!skipTaxRate) {
        if (data.is_multi_rate && data.tax_rates && data.tax_rates.length > 0) {
          rateValue = data.tax_rates[0];  // 多税率全部相同 → 取第一个
        } else {
          rateValue = data.tax_rate;       // 单税率
        }
      }

      let rateFilled = false;

      // --- Step 1: 尝试税率下拉框 ---
      if (rateValue) {
        const taxRateSelect = findFieldSelect(currentDialog, '税率');
        if (taxRateSelect) {
          const selected = await selectDropdownOption(taxRateSelect, rateValue);
          if (selected) {
            rateFilled = true;
            filledItems.push('税率: ' + rateValue);
            console.log('[发票检查 v3.0] ✓ 专票税率已选:', rateValue, '，税额交由系统自动计算');
          } else {
            filledItems.push('⚠ 税率未匹配(' + rateValue + ')，将尝试填税额');
            console.warn('[发票检查 v3.0] 税率下拉未匹配到:', rateValue);
          }
        } else {
          filledItems.push('⚠ 未找到税率下拉框');
          console.warn('[发票检查 v3.0] 未找到税率下拉框');
        }
      } else {
        // 无法填税率的情况（多税率不同/非标准税率/未识别）
        if (data.is_multi_rate) {
          filledItems.push('⚠ 多税率发票（税率不同），请以中台显示为准');
        } else if (data.tax_rate) {
          filledItems.push('⚠ 税率异常(' + data.tax_rate + ')，请手动选择');
        } else {
          filledItems.push('⚠ 税率未识别，请以中台显示为准');
        }
      }

      // --- Step 2: 税额 → 仅当税率未成功填写时回退填税额 ---
      if (!rateFilled) {
        if (data.tax_amount) {
          const taxAmountInput = findFieldInput(currentDialog, '税额');
          if (taxAmountInput) {
            await setInputValue(taxAmountInput, data.tax_amount);
            await sleep(400);
            filledItems.push('税额: ' + data.tax_amount);
            console.log('[发票检查 v3.0] 税率未填写，回退填税额:', data.tax_amount);
          } else {
            filledItems.push('△ 税额(' + data.tax_amount + ')未找到输入框');
          }
        } else {
          filledItems.push('⚠ 税率和税额均未识别，请手动填写');
        }
      }
    }

    // v3.0.19: 触发税额字段自动计算
    // 系统根据 金额×税率 自动计算税额，但程序化 setInputValue 不触发 Vue 响应式联动
    // 用户反馈：手动点击税额字段即可触发计算 → 模拟 focus+blur 来激活
    const taxCalcInput = findFieldInput(currentDialog, '税额');
    if (taxCalcInput) {
      await sleep(300);
      taxCalcInput.focus();
      taxCalcInput.dispatchEvent(new FocusEvent('focus', { bubbles: true }));
      await sleep(150);
      taxCalcInput.blur();
      taxCalcInput.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
      console.log('[发票检查 v3.0] 已触发税额字段焦点以激活系统自动计算');
    }

    // ===== 结果提示 =====
    if (!data.amount) {
      showDetailTip(currentDialog, '⚠️ 未识别到发票金额，请手动填写', 'warning');
    } else if (filledItems.length > 0) {
      // v2.5.11: 合并 doCheck 暂存的弹窗内容（如有），避免双弹窗
      const allItems = pendingFillResults.concat(filledItems);
      if (pendingFillResults.length > 0) {
        console.log('[发票检查 v2.5] tryFillDetail 合并弹窗: doCheck暂存=' + pendingFillResults.length + '项 + 明细=' + filledItems.length + '项 = ' + allItems.length + '项');
      }
      pendingFillResults = [];
      showFillConfirm('ic-detail-confirm', allItems);
      const shortMsg = allItems.length > 1
        ? '✓ 已自动填写' + allItems.length + '项，请核对'
        : '✓ ' + allItems[0];
      showDetailTip(currentDialog, shortMsg, 'success');
    }

    detailDialogFilled = true;

  } catch (e) {
    console.error('[发票检查 v2.5] 金额提取请求失败:', e);
    // v3.0.13: 忽略 extension context 失效（扩展更新后的残留 content script）
    if (!isContextInvalidated(e)) {
      const currentDialog = findDetailDialog() || dialog;
      showDetailTip(currentDialog, '⚠️ 识别服务连接失败，请确认服务已启动', 'error');
    } else {
      console.warn('[发票检查 v3.0] Extension context 已失效，忽略 tryFillDetail 错误');
    }
  }

  detailFillInProgress = false;
}

function showDetailLoading(dialog) {
  removeDetailTip();

  // v3.0.27: 创建居中模态弹窗，带进度条
  const overlay = document.createElement('div');
  overlay.id = 'ic-detail-loading-overlay';
  overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.3);z-index:9999;display:flex;align-items:center;justify-content:center;';

  const modal = document.createElement('div');
  modal.style.cssText = 'background:#fff;border-radius:12px;padding:32px 40px;box-shadow:0 8px 32px rgba(0,0,0,0.2);text-align:center;min-width:320px;animation:icModalFadeIn 0.3s ease;';

  // 图标
  const icon = document.createElement('div');
  icon.style.cssText = 'width:48px;height:48px;margin:0 auto 16px;position:relative;';
  icon.innerHTML = '<div style="position:absolute;top:0;left:0;right:0;bottom:0;border:4px solid #e6f2ff;border-top-color:#409eff;border-radius:50%;animation:icSpin 1s linear infinite;"></div>';

  // 标题
  const title = document.createElement('div');
  title.style.cssText = 'font-size:16px;font-weight:600;color:#333;margin-bottom:8px;font-family:Microsoft YaHei,sans-serif;';
  title.textContent = '系统正在识别中';

  // 副标题
  const subtitle = document.createElement('div');
  subtitle.style.cssText = 'font-size:13px;color:#666;margin-bottom:24px;font-family:Microsoft YaHei,sans-serif;';
  subtitle.textContent = '正在从发票附件提取金额信息，请稍候...';

  // 进度条容器
  const progressBarContainer = document.createElement('div');
  progressBarContainer.style.cssText = 'width:100%;height:6px;background:#e6f2ff;border-radius:3px;overflow:hidden;margin-bottom:8px;';

  // 进度条
  const progressBar = document.createElement('div');
  progressBar.id = 'ic-detail-progress-bar';
  progressBar.style.cssText = 'width:0%;height:100%;background:linear-gradient(90deg,#409eff,#66b1ff);border-radius:3px;transition:width 0.3s ease;';
  progressBarContainer.appendChild(progressBar);

  // 进度文字
  const progressText = document.createElement('div');
  progressText.id = 'ic-detail-progress-text';
  progressText.style.cssText = 'font-size:12px;color:#999;font-family:Microsoft YaHei,sans-serif;';
  progressText.textContent = '0%';

  modal.appendChild(icon);
  modal.appendChild(title);
  modal.appendChild(subtitle);
  modal.appendChild(progressBarContainer);
  modal.appendChild(progressText);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  // 添加动画样式
  const style = document.createElement('style');
  style.id = 'ic-detail-style';
  style.textContent = '@keyframes icSpin{to{transform:rotate(360deg)}}@keyframes icModalFadeIn{from{opacity:0;transform:scale(0.9)}to{opacity:1;transform:scale(1)}}';
  document.head.appendChild(style);

  // 进度动画
  let progress = 0;
  const progressInterval = setInterval(() => {
    progress += Math.random() * 15;
    if (progress > 90) progress = 90; // 保留10%到最后
    const bar = document.getElementById('ic-detail-progress-bar');
    const text = document.getElementById('ic-detail-progress-text');
    if (bar) bar.style.width = progress + '%';
    if (text) text.textContent = Math.round(progress) + '%';
  }, 500);

  // 保存interval以便清理
  window._icDetailProgressInterval = progressInterval;
}

function showDetailTip(dialog, msg, type) {
  removeDetailTip();
  const colors = {
    success: { bg: '#f0f9eb', color: '#67c23a', border: '#e1f3d8' },
    warning: { bg: '#fdf6ec', color: '#e6a23c', border: '#faecd8' },
    error:   { bg: '#fef0f0', color: '#f56c6c', border: '#fde2e2' }
  };
  const c = colors[type] || colors.success;
  const icons = { success: '✓', warning: '⚠️', error: '❌' };

  const tip = document.createElement('div');
  tip.id = 'ic-detail-tip';
  tip.style.cssText = 'padding:8px 16px;margin:8px 0;border-radius:6px;font-size:13px;font-family:Microsoft YaHei,sans-serif;background:' + c.bg + ';color:' + c.color + ';border:1px solid ' + c.border;
  tip.textContent = (icons[type] || '') + ' ' + msg;

  const form = dialog.querySelector('.el-form, .ant-form, form');
  if (form) {
    form.insertBefore(tip, form.firstChild);
  } else {
    const body = dialog.querySelector('.el-dialog__body, .el-drawer__body');
    if (body) body.insertBefore(tip, body.firstChild);
  }

  setTimeout(() => {
    tip.style.transition = 'opacity .5s';
    tip.style.opacity = '0';
    setTimeout(() => { tip.remove(); }, 500);
  }, 5000);
}

function removeDetailTip() {
  // 先完成进度条动画
  const bar = document.getElementById('ic-detail-progress-bar');
  const text = document.getElementById('ic-detail-progress-text');
  if (bar) bar.style.width = '100%';
  if (text) text.textContent = '100%';

  // 清理旧的内联提示
  const old = document.getElementById('ic-detail-tip');
  if (old) old.remove();
  // 清理加载动画
  if (window._icDetailProgressInterval) {
    clearInterval(window._icDetailProgressInterval);
    window._icDetailProgressInterval = null;
  }
  const overlay = document.getElementById('ic-detail-loading-overlay');
  if (overlay) {
    // 完成→稍等一下再淡出，给用户看到100%
    setTimeout(() => {
      overlay.style.opacity = '0';
      overlay.style.transition = 'opacity 0.3s';
      setTimeout(() => { if (overlay.parentNode) overlay.remove(); }, 300);
    }, 400);
  }
  const oldStyle = document.getElementById('ic-detail-style');
  if (oldStyle) oldStyle.remove();
}


// ====== 初始化 ======
if (isInvoicePage()) {
  activate();
} else {
  console.log('[发票检查] 当前页面非发票录入，等待导航触发');
}

console.log('[发票检查 v3.0.39] Content script已加载（时间戳保护防Drawer重开误触发 + lastCompletedFile防取消重触发 + isInvoiceDrawer白名单 + 发票号手工校验 + 浮窗三开关 + 一键重启服务图标 + 提交再检查 + 弹窗关闭报告持久化keepalive/storage + 扩展重载自动注入兼容）');

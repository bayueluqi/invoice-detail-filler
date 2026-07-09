// 发票检查助手 v3.0.36 - background
// 日期: 2026-06-29  制作人: 陆琦
// 负责：弹系统通知 + SPA导航检测 + 购买方清单管理

const SAVED_BUYERS = [
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

chrome.runtime.onMessage.addListener((req, sender, resp) => {
  if (req.action === 'notify') {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icon128.png',
      title: req.title || '发票检查助手',
      message: req.message || ''
    });
    resp({ok: true});
  } else if (req.action === 'get_buyers') {
    resp({ ok: true, buyers: SAVED_BUYERS });
  } else if (req.action === 'fill_buyer_result') {
    console.log('[发票检查 v2.5] 购买方匹配:', req.buyerName, '→', req.matchedName || '(未匹配)', '方法:', req.method);
    resp({ ok: true });
  }
});

const INVOICE_PATTERN = /\/financial\/invoice\/(detail|add)|\/addFinancialdetail|\/myInvoice\/detail/;

chrome.webNavigation.onHistoryStateUpdated.addListener((details) => {
  if (details.frameId !== 0) return;
  if (INVOICE_PATTERN.test(details.url)) {
    chrome.tabs.sendMessage(details.tabId, { action: 'activate' }).catch(() => {});
  } else {
    chrome.tabs.sendMessage(details.tabId, { action: 'deactivate' }).catch(() => {});
  }
}, { url: [{ hostSuffix: 'utscchina.com' }] });

chrome.webNavigation.onCompleted.addListener((details) => {
  if (details.frameId !== 0) return;
  if (INVOICE_PATTERN.test(details.url)) {
    setTimeout(() => {
      chrome.tabs.sendMessage(details.tabId, { action: 'activate' }).catch(() => {});
    }, 500);
  }
}, { url: [{ hostSuffix: 'utscchina.com' }] });

console.log('[发票检查] Background v3.0.36 已启动，预存购买方', SAVED_BUYERS.length, '家');
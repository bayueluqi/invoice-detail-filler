"""
==========================================
版本：v3.0.42（2026-07-09）
相对 v3.0.13 改动：
  1) ★ 修复"文本优先"逻辑反杀：AI与PDF文本都返回有效长度但数字不同时，优先信AI（AI视觉能区分发票号/保单号位置）
     旧逻辑无条件用PDF覆盖AI → 当PDF同时存在发票号+保单号两个20位数字时，文本提取可能抓保单号覆盖AI正确结果
     新逻辑：两者都有效且不同→信AI；仅AI无效时→信PDF
相对 v3.0.13（保留历史）：
  2) AI PROMPT 强化发票号位置约束（紧邻标签+上半部分+排除保单）
  3) PDF 文本回退正则限定前30%+排除保单区域
  4) 其他修复（金额提取、机器编号排除等）
制作人：陆琦
==========================================
"""
import base64, json, os, logging, re, sys, time, traceback
from logging.handlers import RotatingFileHandler
from http.server import HTTPServer, ThreadingHTTPServer, BaseHTTPRequestHandler
from io import BytesIO
import requests

try:
    import pypdf
    HAS_PYPDF = True
except ImportError:
    HAS_PYPDF = False

API_KEY = "c7f8b24ed7d5440f8296b1c52a9a2cb0.HNju2GhUwZeIy4FE"
API_URL = "https://open.bigmodel.cn/api/paas/v4/chat/completions"
MODEL = "glm-4v-flash"
PORT = 52100
# v2.5.12-fix: 版本号统一为常量，避免升级时各接口版本号漏改不一致
VERSION = "3.0.42"

# ========== 日志系统：文件日志为主，控制台日志为辅（pythonw.exe 无控制台，全靠文件日志） ==========
LOG_DIR = os.path.dirname(os.path.abspath(__file__))
LOG_FILE = os.path.join(LOG_DIR, 'invoice-service.log')
LOG_FORMAT = logging.Formatter('%(asctime)s [%(levelname)s] %(message)s', datefmt='%Y-%m-%d %H:%M:%S')

log = logging.getLogger("invoice-checker")
log.setLevel(logging.INFO)

# 文件日志：RotatingFileHandler，单文件最大 5MB，保留 5 个备份
try:
    _fh = RotatingFileHandler(LOG_FILE, maxBytes=5*1024*1024, backupCount=5, encoding='utf-8')
    _fh.setFormatter(LOG_FORMAT)
    log.addHandler(_fh)
except Exception:
    pass  # 文件日志创建失败不阻塞服务启动

# 控制台日志：仅在 python.exe 运行时有效（pythonw.exe 无控制台则无效，无副作用）
if sys.stdout and hasattr(sys.stdout, 'fileno'):
    try:
        _ch = logging.StreamHandler(sys.stdout)
        _ch.setFormatter(LOG_FORMAT)
        log.addHandler(_ch)
    except Exception:
        pass

# 禁止日志冒泡到 root logger（避免重复打印）
log.propagate = False


def pdf_to_images(pdf_bytes):
    try:
        import fitz
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        images = []
        for page in doc:
            pix = page.get_pixmap(dpi=200)
            img_bytes = pix.tobytes("jpeg", jpg_quality=95)
            images.append(base64.b64encode(img_bytes).decode())
        doc.close()
        log.info(f"PyMuPDF: {len(images)}页")
        return images
    except ImportError:
        log.error("PyMuPDF 未安装，PDF转图片不可用")
    except Exception as e:
        log.warning(f"PyMuPDF失败: {e}")
    log.error("无法处理PDF转图片：PyMuPDF 不可用")
    return []


def _extract_pdf_text(pdf_bytes, source="unknown"):
    """v3.0.11: 提取PDF全文，多引擎+多策略容错。返回 (full_text, clean_text, method)"""
    
    # === 策略1: fitz get_text（标准方式）===
    try:
        import fitz
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        full_text = ""
        for page in doc:
            full_text += page.get_text("text") + "\n"
        doc.close()
        clean = re.sub(r'\s', '', full_text)
        if clean:
            return full_text, clean, "fitz"
    except ImportError:
        pass
    except Exception as e:
        log.debug(f"[{source}] fitz标准提取失败: {e}")

    # === 策略2: fitz get_text("dict") — 绕过编码问题 ===
    try:
        import fitz
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        full_text = ""
        for page in doc:
            blocks = page.get_text("dict", flags=fitz.TEXT_PRESERVE_WHITESPACE).get("blocks", [])
            for block in blocks:
                if block.get("type") == 0:  # text block
                    for line in block.get("lines", []):
                        for span in line.get("spans", []):
                            text = span.get("text", "")
                            if text:
                                full_text += text
                        full_text += "\n"
        doc.close()
        clean = re.sub(r'\s', '', full_text)
        if clean:
            log.info(f"[{source}] fitz(dict)编码容错成功")
            return full_text, clean, "fitz-dict"
    except ImportError:
        log.info(f"[{source}] fitz不可用，尝试pypdf...")
    except Exception as e:
        log.debug(f"[{source}] fitz(dict)也失败: {e}")

    # === 策略3: fitz get_text("rawdict") + 手动解码 ===
    try:
        import fitz
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        full_text = ""
        for page in doc:
            blocks = page.get_text("rawdict").get("blocks", [])
            for block in blocks:
                if block.get("type") == 0:
                    for line in block.get("lines", []):
                        for span in line.get("spans", []):
                            text = span.get("text", "")
                            if isinstance(text, bytes):
                                try:
                                    text = text.decode("utf-8", errors="replace")
                                except:
                                    text = text.decode("latin-1", errors="replace")
                            if text:
                                full_text += text
                        full_text += "\n"
        doc.close()
        clean = re.sub(r'\s', '', full_text)
        if clean:
            log.info(f"[{source}] fitz(rawdict)手动解码成功")
            return full_text, clean, "fitz-rawdict"
    except Exception as e:
        log.debug(f"[{source}] fitz(rawdict)失败: {e}")

    # === 策略4: pypdf extract_text() ===
    if HAS_PYPDF:
        try:
            reader = pypdf.PdfReader(BytesIO(pdf_bytes))
            full_text = ""
            for page in reader.pages:
                t = page.extract_text()
                if t:
                    full_text += t + "\n"
            clean = re.sub(r'\s', '', full_text)
            if clean:
                return full_text, clean, "pypdf"
            log.warning(f"[{source}] pypdf提取到空文本")
        except Exception as e:
            log.warning(f"[{source}] pypdf提取异常: {e}")
    else:
        log.warning(f"[{source}] fitz和pypdf均不可用，无法提取PDF文本")

    return None, None, None


def fix_invoice_number_heuristic(number, expected_len=20):
    """v3.0.11: 启发式修正发票号长度。
    
    数电发票号应为20位，AI常因连续0视觉混淆漏识别1位。
    策略：在最长连续0序列中间补一个0。
    """
    if not number or not number.isdigit():
        return number
    
    current_len = len(number)
    if current_len == expected_len:
        return number
    if current_len != expected_len - 1:
        # 差距不是1位，不做猜测（可能是完全错误的号码）
        return number
    
    # 找所有连续0的位置和长度
    zero_runs = []
    i = 0
    while i < len(number):
        if number[i] == '0':
            start = i
            while i < len(number) and number[i] == '0':
                i += 1
            run_len = i - start
            zero_runs.append((start, run_len))
        else:
            i += 1
    
    if not zero_runs:
        return number
    
    # 选最长的连续0段（数电发票中0密集区最易漏识别）
    best_start, best_len = max(zero_runs, key=lambda x: x[1])
    
    # 在最长连续0的中间位置插入一个0
    insert_pos = best_start + best_len // 2
    fixed = number[:insert_pos] + '0' + number[insert_pos:]
    
    log.info(f"[启发式修正] {number}({current_len}位) → {fixed}({len(fixed)}位), "
             f"在第{insert_pos}位(连续{best_len}个0区域)补0")
    
    return fixed


def extract_invoice_no_from_pdf(pdf_bytes):
    """v2.4.7: 按"发票号码"标签精确定位发票号。fitz→pypdf双回退。"""
    full_text, clean, method = _extract_pdf_text(pdf_bytes, "发票号提取")
    if not full_text:
        return None

    label_pos = full_text.find('发票号码')
    if label_pos >= 0:
        window = full_text[label_pos:label_pos+300]
        candidates = re.findall(r'(?<!\d)(\d{8,25})(?!\d)', window)
        for c in candidates:
            if len(c) == 8 or len(c) == 20:
                log.info(f"[{method}] PDF文本[标签定位]提取到发票号: {c} ({len(c)}位)")
                return c
        if candidates:
            n = candidates[0]
            if len(n) > 20:
                n = n[:20]
            else:
                n = n[:8]
            log.info(f"[{method}] PDF文本[标签定位]非标准长度({len(candidates[0])}位)，截断为: {n}")
            return n

    # v3.0.13: "发票号码"标签未找到时的回退策略
    # 发票号一定在文档前半部分（上半部），下半部分的数字（如保单号）必须排除
    # 策略：仅在前 30% 的文本中搜索 8 位或 20 位数字
    upper_text = clean[:max(1, int(len(clean) * 0.3))]
    
    # 先排除"保单"区域：如果文本含"保单"字样，将其后50字符从搜索范围中移除
    policy_pos = upper_text.find('保单')
    if policy_pos >= 0:
        exclude_end = min(policy_pos + 50, len(upper_text))
        upper_text = upper_text[:policy_pos] + ' ' * (exclude_end - policy_pos) + upper_text[exclude_end:]
        log.info(f"[{method}] PDF文本回退: 已排除'保单'区域(pos={policy_pos})")
    
    m8 = re.search(r'(?<!\d)(\d{8})(?!\d)', upper_text)
    if m8:
        log.info(f"[{method}] PDF文本[回退-前30%]匹配独立8位: {m8.group(1)}")
        return m8.group(1)
    m20 = re.search(r'(?<!\d)(\d{20})(?!\d)', upper_text)
    if m20:
        log.info(f"[{method}] PDF文本[回退-前30%]匹配独立20位: {m20.group(1)}")
        return m20.group(1)

    log.info(f"[{method}] PDF文本未找到发票号")
    return None


def classify_pdf_by_text(pdf_bytes):
    """v2.4.7: PDF转图片失败时，用纯文本判断发票类型。"""
    full_text, clean, method = _extract_pdf_text(pdf_bytes, "发票类型分类")
    if not full_text:
        return '其他', '', ''

    has_zhuan = '专用发票' in clean or '增值税专用发票' in clean
    has_pu = '普通发票' in clean or '增值税普通发票' in clean
    if '电子发票' in clean:
        if '（增值税专用发票）' in clean or '(增值税专用发票)' in clean:
            has_zhuan = True
        elif '（增值税普通发票）' in clean or '(增值税普通发票)' in clean:
            has_pu = True
        elif '（专用发票）' in clean or '(专用发票)' in clean:
            has_zhuan = True
        elif '（普通发票）' in clean or '(普通发票)' in clean:
            has_pu = True

    log.info(f"[{method}] 文本分类: has_zhuan={has_zhuan}, has_pu={has_pu}, text_len={len(clean)}")

    if has_zhuan:
        title_match = re.search(r'((?:电子|增值税)?(?:\(|（)?(?:增值税)?专用发票(?:\)|）)?(?:\(货物运输服务\))?)', full_text)
        title = title_match.group(1) if title_match else "专用发票"
        return '专票', title, ''
    elif has_pu:
        title_match = re.search(r'((?:电子|增值税)?(?:\(|（)?(?:增值税)?普通发票(?:\)|）)?)', full_text)
        title = title_match.group(1) if title_match else "普通发票"
        return '普票', title, ''
    else:
        if '发票' not in clean:
            return '其他', '', ''
        return '其他', '', ''


# ========== v2.4 原有 PROMPT（发票类型识别） ==========
PROMPT = """你是发票识别专家。请仔细查看图片，识别发票类型、发票标题、发票号码和购买方。

【三种类型判断标准 - 严格按此判断】

■ 专票：发票标题明确包含「专用发票」字样
  格式示例（这些都是专票）：
  - 「增值税专用发票」
  - 「电子专用发票」
  - 「电子发票（增值税专用发票）」
  - 「电子发票（专用发票）」
  - 「增值税专用发票（货物运输服务）」
  - 「增值税专用发票（机动车销售）」
  - 「增值税专用发票（不动产销售）」
  - 「电子发票（增值税专用发票）（货物运输服务）」

■ 普票：发票标题明确包含「普通发票」字样
  格式示例（这些都是普票）：
  - 「增值税普通发票」
  - 「电子普通发票」
  - 「电子发票（普通发票）」
  - 「电子发票（增值税普通发票）」
  - 「增值税电子普通发票」
  - 「电子普通发票（发票）」

■ 其他：所有不是发票的图片，**一律**判为"其他"
  - 收据、小票、签购单、合同、协议、报价单、账单、对账单、流水单
  - 截图、照片、网页、聊天记录、邮件、文档、表格、PPT、说明书
  - 任何看不到「发票」字样的图片

【关键判断规则】
1. 关键证据在发票标题上：必须看到「普通发票」或「专用发票」连续字样
2. 「电子发票」是形式（电子/纸质），不是类型
3. 真正的类型看「电子发票」后面括号的内容：「专用」= 专票，「普通」= 普票
4. 图片中**没有**看到「发票」字样 → 其他
5. 不确定是不是发票 → 其他

【购买方识别】
- 必须从发票上"购买方信息"或"购方"区块的"名称"行识别
- 必须是公司全称，**不要简称、不要省略**
- 如果购买方名称中间有"（有限合伙）"等括号内容，**必须保留**
- 看不清或购买方信息缺失时填"未识别"
- 其他时 buyer 填空字符串 ""

【输出格式 - 严格JSON，无多余文字】
{"type": "专票" 或 "普票" 或 "其他", "number": "发票号码字符串", "title": "发票标题", "buyer": "购买方公司全称"}

说明：
- type: 必须是「专票」/「普票」/「其他」三个值之一
- number: 专票或普票时填实际看到的发票号码（纯数字）；其他时填空字符串 ""
- title: 专票或普票时填实际看到的发票标题原文；其他时填空字符串 ""
- buyer: 专票/普票时填"购买方"完整公司全称；其他时填空字符串 ""

【发票号识别铁律（以下5条必须全部满足）】
⚠️ 发票号误识别是严重错误，请逐条检查：

1. 【标签邻近】发票号必须紧邻"发票号码"标签右侧 → 如果目标数字周围没有"发票号码"字样，它不是发票号
2. 【位置限定】发票号一定在发票图片的正右上方（上半部分），不可能出现在发票下半部分
   - 运输发票/客运发票底部常印有"保单号""保单号码"，这些在图片下半部分 → 绝不是发票号
3. 【排除保单】如果看到"保单"字样旁边的数字（不论几位），一律跳过，那不是发票号
4. 【排除其他】开户行账号、纳税人识别号、机器编号、校验码、金额 → 都不是发票号
5. 【标准长度】8位（旧版）或20位（数电发票）→ 长度不对就重新找

【示例1】输入：专票，号码2631200003829276951，购买方"上海优通国际物流有限公司"
输出：{"type":"专票","number":"2631200003829276951","title":"电子发票（增值税专用发票）","buyer":"上海优通国际物流有限公司"}

【示例2】输入：普票，号码12345678，购买方"上海万顺供应链管理有限公司"
输出：{"type":"普票","number":"12345678","title":"电子普通发票","buyer":"上海万顺供应链管理有限公司"}

【示例3】输入：合同截图
输出：{"type":"其他","number":"","title":"","buyer":""}

再次强调：只输出这一个 JSON 对象，不要任何多余内容。"""


# ========== v2.5.0 新增：发票金额提取 PROMPT ==========
PROMPT_DETAIL = """你是发票金额识别专家。请仔细查看发票图片，提取发票的金额信息。

【提取字段】
1. total_amount: 价税合计（含税总金额），纯数字如 "100.00"
2. tax_rate: 税率，如 "3%"、"6%"、"9%"、"13%"
   - 如果发票明细中有两种或以上不同税率，填 "多税率"
   - 看不出税率填空字符串 ""
3. tax_amount: 税额，如 "2.91"
   - 多税率时填合计税额
   - 看不出税额填空字符串 ""
4. is_multi_rate: 是否多税率发票（true/false）

【⚠️ total_amount 提取规则（最高优先级）】
- total_amount = 发票底部的"价税合计(小写)"旁边的数字，带¥符号
- 这是全发票最大的金额数字！如果看到多个金额，total_amount 一定是其中最大的
- ❌ 绝对禁止使用明细行/清单中某一行的"金额"列作为 total_amount
- ❌ 绝对禁止使用"合计"行的金额(那是不含税的)，要用"价税合计"
- ❌ 绝对禁止把"机器编号"当成金额！机器编号是12位或20位纯整数（无小数点），在左上角二维码下方
- 如果看不清价税合计区域宁可返回空字符串也不要猜一个错误数字
- 价税合计通常在发票底部右侧, 标签为 "价税合计(小写)" 或 "(小写)"

【⚠️ 常见误判陷阱】
1. 机器编号：12~20位纯整数，无¥符号无小数点，在发票标题/二维码附近 → 不是金额
2. 发票号码：8位或20位纯整数 → 不是金额
3. 校验码/密码区：长串数字+符号 → 不是金额
4. 明细行的"金额"列：是不含税金额 → 不是价税合计
5. 正确的金额特征：有¥符号 + 有2位小数(如12.00) + 在发票底部"价税合计"区域

【识别要点】
- 价税合计在发票底部，标签"价税合计"旁，通常有¥符号
- 税率在明细行的"税率"列
- 税额在明细行的"税额"列或"合计"行
- 非发票图片：total_amount 填 ""，其他字段填默认值

【金额识别特别注意】
- 仔细看小数点位置，不要把 100.00 看成 1000.0
- 注意千分位逗号：1,000.00 是一千不是一百
- 价税合计 = 金额(不含税) + 税额
- 普票常见金额范围：几元到几万元（不可能是几十亿！）

【输出格式 - 严格JSON，无多余文字】
{"total_amount": "100.00", "tax_rate": "3%", "tax_amount": "2.91", "is_multi_rate": false}"""


def parse_ai_response(content):
    """v2.4 解析：JSON + 严格反向证据校验 + 兼容模式 + 购买方字段"""
    content_raw = content or ''

    json_match = re.search(r'\{[^{}]*\}', content_raw)
    if json_match:
        try:
            data = json.loads(json_match.group())
            ai_type = str(data.get('type', '')).strip()
            ai_number = str(data.get('number', '')).strip()
            ai_title = str(data.get('title', '')).strip()
            ai_buyer = str(data.get('buyer', '')).strip()

            if ai_type not in ('专票', '普票', '其他'):
                log.warning(f"AI返回的type='{ai_type}'不在三选一内，降级为其他")
                return '其他', content_raw, '', ai_title or '', ''

            if ai_type == '专票':
                if ('专用' not in ai_title) and ('专用' not in content_raw):
                    log.warning(f"幻觉拦截：AI返回'专票'但title和content中均无'专用'字样")
                    return '其他', content_raw, '', ai_title or '', ''
            elif ai_type == '普票':
                if ('普通' not in ai_title) and ('普通' not in content_raw):
                    log.warning(f"幻觉拦截：AI返回'普票'但title和content中均无'普通'字样")
                    return '其他', content_raw, '', ai_title or '', ''

            if ai_number:
                cleaned_num = re.sub(r'\D', '', ai_number)
                if cleaned_num != ai_number:
                    log.info(f"发票号清理 '{ai_number}' -> '{cleaned_num}'")
                ai_number = cleaned_num

            if ai_number:
                num_len = len(ai_number)
                if num_len in (8, 20):
                    log.info(f"发票号长度校验通过 ({num_len}位): {ai_number}")
                else:
                    log.warning(f"发票号长度异常 ({num_len}位): {ai_number}")

            if ai_buyer:
                ai_buyer = re.sub(r'\s+', '', ai_buyer)

            if ai_type == '其他':
                ai_number = ''
                ai_title = ''
                ai_buyer = ''

            return ai_type, content_raw, ai_number, ai_title, ai_buyer
        except (json.JSONDecodeError, KeyError, TypeError, ValueError) as e:
            log.warning(f"JSON解析失败: {e}")

    cleaned = content_raw
    for ch in ['。', '.', ',', '，', '：', ':', ' ', '\n', '\t', '"', '"', '"', "'", '`', '\r']:
        cleaned = cleaned.replace(ch, '')
    cleaned = cleaned.strip()

    if cleaned in ('专票', '普票', '其他'):
        return cleaned, content_raw, '', '', ''
    if ('专票' in cleaned or '专用发票' in cleaned) and '专用' in cleaned:
        return '专票', content_raw, '', '', ''
    if ('普票' in cleaned or '普通发票' in cleaned) and '普通' in cleaned:
        return '普票', content_raw, '', '', ''

    return '其他', content_raw, '', '', ''


def check_ai(fdata, fname):
    """v2.4.5 发票类型识别（原有功能，保持不变）"""
    ext = os.path.splitext(fname)[1].lower() if fname else ''
    image_parts = []
    text_extracted_no = None

    if ext == '.pdf':
        pdf_bytes = base64.b64decode(fdata)
        text_extracted_no = extract_invoice_no_from_pdf(pdf_bytes)
        img_list = pdf_to_images(pdf_bytes)
        if not img_list:
            log.warning("PDF转图片失败，尝试纯文本判断...")
            text_type, text_title, text_buyer = classify_pdf_by_text(pdf_bytes)
            if text_extracted_no:
                return text_type, "PDF转图片失败(文本模式)", text_extracted_no, text_title, text_buyer
            else:
                return text_type, "PDF转图片失败(文本模式)", "", text_title, text_buyer
        for img in img_list[:3]:
            image_parts.append({"type": "image_url", "image_url": {"url": "data:image/jpeg;base64," + img}})
    else:
        mime_map = {'.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.bmp':'image/bmp','.webp':'image/webp','.gif':'image/gif','.tiff':'image/tiff','.tif':'image/tiff'}
        mime = mime_map.get(ext, 'image/jpeg')
        image_parts.append({"type": "image_url", "image_url": {"url": f"data:{mime};base64,{fdata}"}})

    if not image_parts:
        return "其他", "无法解析文件", "", "", ""

    headers = {"Authorization": "Bearer " + API_KEY, "Content-Type": "application/json"}

    def call_ai(prompt_text, tag):
        messages = [{"role": "user", "content": [{"type": "text", "text": prompt_text}] + image_parts}]
        log.info(f"{tag} AI请求: {fname}, ~{len(fdata)//1024}KB")
        r = requests.post(API_URL, headers=headers, json={
            "model": MODEL, "messages": messages,
            "max_tokens": 300, "temperature": 0.1, "top_p": 0.1
        }, timeout=60)
        r.raise_for_status()
        content = r.json()['choices'][0]['message']['content'].strip()
        log.info(f"{tag} AI回复: {content[:300]}")
        return content

    try:
        content1 = call_ai(PROMPT, "v2.4.3")
        ai_type, raw, number, title, buyer = parse_ai_response(content1)
        log.info(f"首次解析: type={ai_type}, number={number}, title={title}, buyer={buyer}")

        if number and len(number) not in (8, 20):
            old_len = len(number)
            # 判断期望长度：数电发票20位，旧版8位
            expected = 20 if old_len > 10 else 8
            diff = expected - old_len
            
            retry_prompt = PROMPT + (
                f"\n\n【重试反推】你刚才识别的发票号是「{number}」（{old_len} 位），"
                f"但标准长度是 8 位（旧版发票）或 20 位（数电发票）。\n"
                f"**你返回了 {old_len} 位，差 {diff} 位。最常见原因：连续的0被漏数或多数。**\n"
                f"例如「00000」可能被看成「0000」（少1个0）。\n"
                f"请重新仔细看图片右上角「发票号码」那一行，逐个数字数清楚，\n"
                f"特别注意所有连在一起的0到底有几个。\n"
                f"目标：输出一个 {expected} 位的纯数字发票号。\n"
                f"**只输出修正后的 JSON**。"
            )
            try:
                content2 = call_ai(retry_prompt, "v2.4.3-retry")
                ai_type2, raw2, number2, title2, buyer2 = parse_ai_response(content2)
                if number2 and len(number2) in (8, 20):
                    log.info(f"重试修正成功: {number} ({old_len}位) → {number2} ({len(number2)}位)")
                    return ai_type, raw, number2, title, buyer
                else:
                    log.warning(f"重试后仍异常: {number2}（{len(number2) if number2 else 0}位），尝试启发式修正")
            except Exception as e2:
                log.error(f"重试调用失败: {e2}")

        # v3.0.14: 智能决策 — AI vs PDF文本，谁更可信？
        # 原则：AI视觉能看到数字旁边的标签（"发票号码" vs "保单号"），
        #       PDF文本提取只能做正则匹配，分不清发票号还是保单号。
        # 策略：两者都返回有效长度但数字不同 → 信AI（视觉有位置信息）
        #       AI长度无效但PDF有效 → 信PDF（AI少数0/多数0，文本更准）
        ai_valid = number and len(number) in (8, 20)
        pdf_valid = text_extracted_no and len(text_extracted_no) in (8, 20)
        
        if text_extracted_no:
            if not number:
                # AI没返回，直接用PDF
                number = text_extracted_no
                log.info(f"文本保底: AI无结果，使用文本={text_extracted_no}")
            elif number != text_extracted_no:
                if ai_valid and pdf_valid:
                    # 两者都有效但数字不同 → AI视觉有位置信息，优先信AI
                    log.warning(f"AI vs 文本不一致! AI={number}({len(number)}位✓) 文本={text_extracted_no}({len(text_extracted_no)}位)")
                    log.warning(f"→ 优先信AI（AI能看到数字旁边的标签，能区分发票号/保单号）")
                    # 保持 number 不变（用AI结果）
                elif pdf_valid and not ai_valid:
                    # AI长度无效，PDF有效 → 信PDF（AI少数0了）
                    log.info(f"AI长度异常({len(number)}位)但文本有效({len(text_extracted_no)}位) → 文本优先: {text_extracted_no}")
                    number = text_extracted_no
                elif ai_valid and not pdf_valid:
                    # AI有效，PDF无效 → 信AI
                    log.info(f"文本长度异常({len(text_extracted_no)}位)但AI有效({len(number)}位) → 保持AI: {number}")
                else:
                    # 两者都无效 → 信PDF（至少是人类打印的数字）
                    log.warning(f"两者长度均异常 AI={number}({len(number)}位) 文本={text_extracted_no}({len(text_extracted_no)}位) → 暂用文本: {text_extracted_no}")
                    number = text_extracted_no
            # else: 两者相同，无需处理
        elif not text_extracted_no and number:
            # v3.0.11: AI结果长度异常时，尝试启发式修正
            if len(number) not in (8, 20):
                fixed = fix_invoice_number_heuristic(number)
                if fixed and len(fixed) in (8, 20):
                    log.info(f"AI结果({len(number)}位)启发式修正为: {fixed}({len(fixed)}位)")
                    number = fixed
            if len(number) in (8, 20):
                log.info(f"文本未提取到，使用AI结果: {number}")
            else:
                log.warning(f"发票号长度异常且无法修正({len(number)}位): {number}")

        return ai_type, raw, number, title, buyer
    except Exception as e:
        log.error(f"AI失败: {e}")
        return "其他", f"AI识别失败: {e}", "", "", ""


# ========== v2.5.0 新增：发票金额提取 ==========

def _safe_float(s):
    """安全转浮点数"""
    if not s:
        return None
    try:
        return float(s.replace(',', ''))
    except (ValueError, TypeError):
        return None


def extract_detail_from_text(pdf_bytes):
    """v3.0.12: 从PDF文本中提取金额信息（文本优先，可靠性远高于AI视觉）
    v3.0.12修复: 数电票PDF文本提取顺序与视觉不一致导致机器编号被当金额。
    多重策略逐步降级: 价税合计标签定位 → clean文本匹配 → 合计行匹配(加固) → 最大金额兜底
    返回: { amount, tax_rate, tax_amount, is_multi_rate, method } 或 None
    """
    full_text, clean, method = _extract_pdf_text(pdf_bytes, "金额提取")
    if not full_text:
        return None

    result = {
        'amount': None,
        'tax_rate': None,
        'tax_amount': None,
        'is_multi_rate': False,
        'method': method
    }

    # ===== 预处理：识别并排除"机器编号"区域的数字（v3.0.12新增）=====
    # 数电票的"机器编号"字段包含12位数字，容易被误判为金额
    machine_no_areas = set()
    for jq_match in re.finditer(r'机器编号[：:\s]*', full_text):
        area = full_text[jq_match.end():jq_match.end() + 20]
        jq_nums = re.findall(r'\d{8,}', area)
        if jq_nums:
            machine_no_areas.add(jq_nums[0])
            log.debug(f"[{method}] 排除机器编号区域数字: {jq_nums[0]}")

    def _is_machine_no(num_str):
        clean_num = re.sub(r'[,\s]', '', num_str)
        return clean_num in machine_no_areas

    # ===== 策略0: v3.0.5 正规发票 — 先锚定"价税合计"，再搜"（小写）¥" =====
    # v3.0.12: 窗口从300扩大到2000（数电票PDF文本可能非常分散）
    # 数电票底部标准格式: 价税合计（大写）XXX圆整  （小写）¥2893.00
    # v3.0.12: 窗口从300扩大到2000（数电票PDF文本可能非常分散）
    tc_pos0 = full_text.find('价税合计')
    if tc_pos0 >= 0:
        tc_win0 = full_text[tc_pos0:tc_pos0 + 2000]
        # 窗口内找"（小写）¥" — 放宽到允许任意空白（包括换行、空格）
        xx_match = re.search(r'[（(]小写[）)][\s\S]{0,30}[¥￥]\s*(\d[\d,]*\.\d{2})', tc_win0)
        if xx_match and _safe_float(xx_match.group(1)):
            result['amount'] = xx_match.group(1).replace(',', '')
            log.info(f"[{method}] 策略0-正规发票(小写)¥: {result['amount']}")

    # ===== 策略1: 定位"价税合计"标签 — 窗口内取所有¥金额的最大值 =====
    # v3.0.12: 窗口从200扩大到2000 + 排除机器编号
    if not result['amount']:
        label_pos = full_text.find('价税合计')
        if label_pos >= 0:
            window = full_text[label_pos:label_pos + 2000]
            all_amounts = re.findall(r'[¥￥]\s*(\d[\d,]*\.?\d*)', window)
            if all_amounts:
                valid_amounts = [(a.replace(',', ''), _safe_float(a.replace(',', ''))) for a in all_amounts]
                valid_amounts = [(a, v) for a, v in valid_amounts if v and not _is_machine_no(a)]
                if valid_amounts:
                    # 取最大值（价税合计 ≥ 不含税金额，取最大值自动命中价税合计）
                    best = max(valid_amounts, key=lambda x: x[1])
                    result['amount'] = best[0]
                    log.info(f"[{method}] 策略1-价税合计窗口max(¥): {result['amount']} (共{len(valid_amounts)}个候选: {[a for a,_ in valid_amounts]})")

    # ===== 策略1.5: v3.0.12 新增 — 从"价税合计"搜到文档末尾找"(小写)+¥" =====
    # 某些数电票的"价税合计"标签和实际金额相距超过2000字符
    if not result['amount'] and tc_pos0 >= 0:
        tail_text = full_text[tc_pos0:]
        xx_far = re.search(r'[（(]小写[）)][\s\S]{0,50}[¥￥]\s*(\d[\d,]*\.\d{2})', tail_text)
        if xx_far and _safe_float(xx_far.group(1)):
            result['amount'] = xx_far.group(1).replace(',', '')
            log.info(f"[{method}] 策略1.5-价税合计→末尾(小写)¥: {result['amount']}")

    # ===== 策略2: 在clean文本中查找（去除空格换行后更可靠） =====
    if not result['amount']:
        cp = clean.find('价税合计')
        if cp >= 0:
            cw = clean[cp:cp + 200]  # v3.0.12: 从100扩大到200
            m = re.search(r'[¥￥]?(\d+\.\d{2})', cw)
            if m and _safe_float(m.group(1)) and not _is_machine_no(m.group(1)):
                result['amount'] = m.group(1)
                log.info(f"[{method}] 文本提取价税合计(clean): {result['amount']}")

    # ===== 策略3: 查找"合计"行（有些发票用"合计"而非"价税合计"） =====
    # v3.0.12 加固: 要求金额必须有2位小数格式(.XX)，排除超长整数（机器编号等）
    if not result['amount']:
        合计_match = re.findall(r'(?:^|[^\u4e00-\u9fa5])合\s*计[^\d]*(\d[\d,]*\.?\d*)', full_text)
        if 合计_match:
            candidates = []
            for v in 合计_match:
                fv = _safe_float(v.replace(',', ''))
                # v3.0.12 加固条件：
                has_dot = '.' in v
                num_digits = len(re.sub(r'[,.\s]', '', v))
                is_reasonable = fv and fv > 0.01 and has_dot and num_digits <= 10 and not _is_machine_no(v)
                if is_reasonable:
                    candidates.append(fv)
            if candidates:
                best = max(candidates)
                result['amount'] = f'{best:.2f}'
                log.info(f"[{method}] 文本提取合计行(最大): {result['amount']} (共{len(candidates)}个候选)")
            else:
                log.debug(f"[{method}] 合计行匹配到{len(合计_match)}个数字但全部被过滤(需.格式+≤10位+非机器编号)")

    # ===== 策略4: 终极兜底 — 取全文档最大金额 =====
    # 原理: 发票上的价税合计(含税总额)一定是最大的金额数字
    # v3.0.12: 排除机器编号区域 + 要求小数点 + 限制长度≤12位
    if not result['amount']:
        all_money = re.findall(r'[¥￥]\s*(\d[\d,]*\.?\d*)', full_text)
        if all_money:
            values = []
            for v in all_money:
                if _is_machine_no(v):
                    continue
                fv = _safe_float(v.replace(',', ''))
                has_decimal = '.' in v
                num_digits = len(re.sub(r'[,.\s]', '', v))
                if fv and fv > 0.01 and has_decimal and num_digits <= 12:
                    values.append(fv)
            if values:
                max_val = max(values)
                result['amount'] = f'{max_val:.2f}'
                log.info(f"[{method}] 终极兜底(取文档最大¥金额): {result['amount']} (共{len(values)}个候选)")
            else:
                log.warning(f"[{method}] 终极兜底: 找到{len(all_money)}个¥数字但全部被过滤(需.格式+长度≤12+非机器编号)")

    # ===== 2. 提取税率 =====
    # v2.5.11: 数电票税率列常写成"0.13"或"13"而非"13%"，需兼容
    # v2.5.12-fix: 小数形式正则放宽到3位(0.015=1.5%)，并收紧税率上限(0~17%)防误判
    # v3.0.6-fix: 税率正则必须在full_text上运行, 不能使用clean!
    #   clean会无空格拼接"2654.13"+"9%"→"2654.139%", 正则误捕获26.139→超出17被丢弃
    #   full_text中"2654.13\n9%"有换行分隔, 正则正确匹配独立的"9%"
    # 优先级1: 带%符号的（如 13%）
    pcts_with_symbol = re.findall(r'(\d{1,2}(?:\.\d+)?)\s*%', full_text)
    # 优先级2: 不带%的小数形式（如 0.13 / .13 / 0.015）
    # \d{1,3} 覆盖 0.13(2位) 和 0.015(3位, 即1.5%)
    pcts_decimal = re.findall(r'(?<!\d)(0?\.\d{1,3})(?!\d)', full_text)
    # 把小数形式转成整数百分比（0.13 → 13, 0.015 → 1.5）
    pcts_decimal_as_pct = []
    for p in pcts_decimal:
        try:
            v = float(p) * 100
            # v2.5.12-fix: 严格限制 0~17（中国增值税率范围），过滤掉 0.5(50%) 等非税率小数
            if 0 < v <= 17:
                pcts_decimal_as_pct.append(f'{v:g}')
        except ValueError:
            pass

    all_pcts = pcts_with_symbol + pcts_decimal_as_pct

    # v2.5.26: 中国增值税标准税率白名单（覆盖全部历史+现行税率）
    STANDARD_VAT_RATES = {0, 1, 3, 5, 6, 9, 11, 13}

    valid_rates = []
    for r in all_pcts:
        try:
            rv = float(r)
            if 0 <= rv <= 17:
                valid_rates.append(r)
        except ValueError:
            pass

    # v2.5.29: 初始化变量避免 UnboundLocalError（当 valid_rates 为空时）
    standard_rates = []
    non_standard_rates = []

    if valid_rates:
        seen = set()
        unique_rates = []
        # v2.5.26: 分离标准税率和非标准值，只用标准税率做判断
        standard_rates = []
        non_standard_rates = []
        for r in valid_rates:
            if r not in seen:
                seen.add(r)
                try:
                    rv = float(r)
                    # 允许±0.05误差（处理浮点数如 5.9999→6）
                    is_standard = any(abs(rv - sr) < 0.05 for sr in STANDARD_VAT_RATES)
                    if is_standard:
                        standard_rates.append(r)
                    else:
                        non_standard_rates.append(r)
                except ValueError:
                    non_standard_rates.append(r)

        # 优先使用标准税率
        if standard_rates:
            result['tax_rate'] = standard_rates[0] + '%'
            result['tax_rates'] = list(standard_rates)  # v2.5.30: 所有标准税率清单, 供前端判断是否同一档
            if len(standard_rates) > 1:
                result['is_multi_rate'] = True
                log.info(f"[{method}] 检测到多标准税率: {standard_rates}")
            else:
                log.info(f"[{method}] 文本提取标准税率: {standard_rates[0]}%")
                # v2.5.26: 如果同时存在非标准值，也标记为多税率(可能混合)
                if non_standard_rates:
                    log.info(f"[{method}] 同时发现非标准值(忽略): {non_standard_rates}")
        elif non_standard_rates:
            # 只有非标准税率值 → 不设tax_rate(避免前端用垃圾值匹配下拉框)
            # 但如果有多个不同值, 说明很可能是多税率混合
            log.warning(f"[{method}] 仅检测到非标准税率值(已忽略作为税率): {non_standard_rates}")
            if len(non_standard_rates) > 1:
                result['is_multi_rate'] = True
                log.info(f"[{method}] 多个非标准值→推断为多税率发票")

    # v2.5.28: 调试日志 — 打印所有找到的百分数，方便排查多税率漏检
    if not result.get('is_multi_rate') and all_pcts:
        log.info(f"[{method}] 税率排查: all_pcts={all_pcts}, standard={standard_rates}, non_standard={non_standard_rates}")

    # ===== 3. 提取税额（v2.5.28: 多重策略，重点解决电子专票税额提取）=====
    # v3.0.7: amount 保持为价税合计（蓝票金额=发票上最大金额=价税合计），不再反推不含税
    #
    # 策略A（新增，最有效）: 在"价税合计"区域找第二个¥数字
    #   电子专票布局通常是：价税合计(大写)... | (小写)¥688.00    | ¥59.05(税额框)
    #   即税额和总价在同一个视觉区域内，只需找到该区域内的较小金额即可
    #
    # 策略B（原有）: 搜索"税额"/"合计税额"等关键词附近的数字
    #
    # 策略C（兜底）: 将明细行中"税额"列的所有数字求和

    tax_amount_found = False

    # v3.0.6: 确保 label_pos 已初始化（策略0成功时 label_pos 可能未定义）
    if 'label_pos' not in dir():
        label_pos = full_text.find('价税合计')

    # ===== 策略A: 价税合计区域的辅助数字 =====
    if result['amount']:
        amt_val = _safe_float(result['amount'])
        if amt_val:
            # 定位"价税合计"所在区域（扩大搜索范围到前后300字符）
            amt_area = ''
            if label_pos >= 0:
                amt_area = full_text[max(0, label_pos - 50):label_pos + 350]
            else:
                cp = clean.find('价税合计')
                if cp >= 0:
                    # clean中去掉了空白, 需要在full_text中定位对应位置
                    cp2 = full_text.find('价税合计')
                    if cp2 >= 0:
                        amt_area = full_text[max(0, cp2 - 50):cp2 + 350]

            if amt_area:
                # 找区域内所有¥金额
                all_nums = re.findall(r'[¥￥]\s*(\d[\d,]*\.?\d*)', amt_area)
                candidates = []
                for n in all_nums:
                    fv = _safe_float(n.replace(',', ''))
                    # 取 明显小于总价 且 > 0.01 的数字（排除0.00等）
                    if fv and 0.01 < fv < amt_val * 0.99:
                        candidates.append(fv)

                if candidates:
                    # v3.0.7-fix: 税额是价税合计区域内最小的有效金额(不含税>税额)
                    # 原代码用max()会把不含税金额误当税额, 改为min()
                    best_tax = min(candidates)
                    result['tax_amount'] = f'{best_tax:.2f}'
                    tax_amount_found = True
                    log.info(f"[{method}] 策略A-价税合计区域提取税额: {result['tax_amount']} (共{len(candidates)}个候选: {[f'{c:.2f}' for c in candidates]}, 取min)")

    # ===== 策略B: 关键词匹配（原有逻辑保留作为补充）=====
    if not tax_amount_found:
        # v3.0.6: 加入"税 额"(含空格) — fitz提取PDF时"税额"被拆成两行"税"和"额"
        tax_label_keywords = ['合计税额', '税额合计', '增值税额', '税 额', '税额']
        tax_label_positions = []
        seen_positions = set()
        for kw in tax_label_keywords:
            pos = 0
            while True:
                idx = full_text.find(kw, pos)
                if idx < 0:
                    break
                if idx not in seen_positions:
                    tax_label_positions.append(idx)
                    seen_positions.add(idx)
                pos = idx + 1

        tax_label_positions.sort()

        for tpos in tax_label_positions:
            nearby = full_text[max(0, tpos - 50):tpos + 80]
            # 优先匹配"合计"附近的税额（最可能是真正的合计税额）
            if '合计' in nearby or tpos == tax_label_positions[-1]:
                window = full_text[tpos:tpos + 80]
                m = re.search(r'[¥￥]?\s*(\d[\d,]*\.\d{2})', window)
                if m and _safe_float(m.group(1)):
                    val = m.group(1).replace(',', '')
                    if result['amount'] and _safe_float(val) <= _safe_float(result['amount']):
                        result['tax_amount'] = val
                        tax_amount_found = True
                        log.info(f"[{method}] 策略B-文本提取税额: {val} (在位置 {tpos} 找到关键词)")
                        break
                    elif not result['amount']:
                        result['tax_amount'] = val
                        tax_amount_found = True
                        log.info(f"[{method}] 策略B-文本提取税额(无参照): {val}")
                        break

    # ===== 策略C: 明细行税额求和兜底 =====
    # 有些发票的税额只出现在明细行的"税额"列中，没有单独的合计行
    if not tax_amount_found:
        # v3.0.6: 加强正则 — "税额"后可能有¥符号(税额¥238.87), 使¥可选
        # 电子专票明细行格式: ...金额 304.42  税率/征收率 13%  税额 ¥39.58
        tax_detail_pattern = re.findall(r'税额[¥￥]?\s*(\d[\d,]*\.\d{2})', clean)
        if tax_detail_pattern:
            detail_tax_values = [_safe_float(v.replace(',', '')) for v in tax_detail_pattern]
            detail_tax_values = [v for v in detail_tax_values if v and v > 0.01]
            if detail_tax_values:
                total_tax = sum(detail_tax_values)
                # 合理性校验：税额之和应小于总价
                if result['amount'] and total_tax < _safe_float(result['amount']) * 0.95:
                    result['tax_amount'] = f'{total_tax:.2f}'
                    tax_amount_found = True
                    log.info(f"[{method}] 策略C-明细行税额求和: {result['tax_amount']} ({len(detail_tax_values)}行: {[f'{v:.2f}' for v in detail_tax_values]})")
                    # 多行税额明细 → 推断为多税率发票
                    if len(detail_tax_values) > 1:
                        result['is_multi_rate'] = True
                        log.info(f"[{method}] {len(detail_tax_values)}行税额明细→推断为多税率发票")

    if result['amount'] or result['tax_rate'] or result['tax_amount']:
        return result

    return None


def extract_detail_ai(fdata, fname):
    """v2.5.0: AI视觉识别发票金额信息"""
    ext = os.path.splitext(fname)[1].lower() if fname else ''
    image_parts = []

    if ext == '.pdf':
        pdf_bytes = base64.b64decode(fdata)
        img_list = pdf_to_images(pdf_bytes)
        if not img_list:
            log.warning("PDF转图片失败，AI视觉不可用")
            return None
        for img in img_list[:3]:
            image_parts.append({"type": "image_url", "image_url": {"url": "data:image/jpeg;base64," + img}})
    else:
        mime_map = {'.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
                    '.bmp': 'image/bmp', '.webp': 'image/webp', '.gif': 'image/gif'}
        mime = mime_map.get(ext, 'image/jpeg')
        image_parts.append({"type": "image_url", "image_url": {"url": f"data:{mime};base64,{fdata}"}})

    if not image_parts:
        return None

    headers = {"Authorization": "Bearer " + API_KEY, "Content-Type": "application/json"}
    messages = [{"role": "user", "content": [{"type": "text", "text": PROMPT_DETAIL}] + image_parts}]

    try:
        r = requests.post(API_URL, headers=headers, json={
            "model": MODEL, "messages": messages,
            "max_tokens": 300, "temperature": 0.1, "top_p": 0.1
        }, timeout=60)
        r.raise_for_status()
        content = r.json()['choices'][0]['message']['content'].strip()
        log.info(f"金额AI回复: {content[:300]}")

        json_match = re.search(r'\{[^{}]*\}', content)
        if json_match:
            data = json.loads(json_match.group())
            total = str(data.get('total_amount', '')).strip()
            rate = str(data.get('tax_rate', '')).strip()
            tax_amt = str(data.get('tax_amount', '')).strip()
            multi = data.get('is_multi_rate', False)

            if total:
                total = total.replace('¥', '').replace('￥', '').replace(',', '').strip()
            if tax_amt:
                tax_amt = tax_amt.replace('¥', '').replace('￥', '').replace(',', '').strip()

            return {
                'amount': total if total and _safe_float(total) else None,
                'tax_rate': rate if rate else None,
                'tax_amount': tax_amt if tax_amt and _safe_float(tax_amt) else None,
                'is_multi_rate': bool(multi),
                'method': 'ai'
            }
    except Exception as e:
        log.error(f"金额AI识别失败: {e}")

    return None


def extract_detail(fdata, fname, selected_type):
    """v2.5.29: 主提取流程：文本优先(4重策略) → AI兜底
    返回: { amount, tax_rate, tax_amount, is_multi_rate, method, source }
    
    v2.5.29 重要修正: 移除了 v2.5.27 加入的交叉校验(差异>10%信任文本),
    因为该逻辑在某些发票上会导致反向保护(文本提取到垃圾值如194.34,
    而AI正确返回4368.51,但交叉校验反而丢弃了正确的AI值)。
    修复策略: AI Prompt已足够明确禁止幻觉,不再需要这种容易误伤的防御。
    """
    ext = os.path.splitext(fname)[1].lower() if fname else ''
    result = {
        'amount': None,
        'tax_rate': None,
        'tax_amount': None,
        'is_multi_rate': False,
        'method': 'none',
        'source': 'none'
    }

    # PDF: 优先文本提取（4重策略：标签定位→clean匹配→合计行→最大金额兜底）
    if ext == '.pdf':
        pdf_bytes = base64.b64decode(fdata)
        text_result = extract_detail_from_text(pdf_bytes)
        if text_result:
            log.info(f"文本提取: amount={text_result.get('amount')}, rate={text_result.get('tax_rate')}, tax={text_result.get('tax_amount')}, multi={text_result.get('is_multi_rate')}")
            result.update(text_result)
            result['source'] = 'text'
            # 有金额+任一税率/税额信息就提前返回（避免不必要的AI调用）
            if result['amount'] and (result['tax_rate'] or result['tax_amount'] or result['is_multi_rate']):
                return result

    # AI视觉兜底 — 填补文本提取的空白字段
    # v2.5.29: 不再做交叉校验(差异>10%信任文本),因为该逻辑容易误伤。
    # AI Prompt已明确要求"取价税合计(小写)",可靠性足够。
    ai_result = extract_detail_ai(fdata, fname)
    if ai_result:
        log.info(f"AI提取: amount={ai_result.get('amount')}, rate={ai_result.get('tax_rate')}, tax={ai_result.get('tax_amount')}, multi={ai_result.get('is_multi_rate')}")

        # v2.5.29: 智能金额选择 — 当AI返回完整税务信息而文本只有孤立的金额时,信任AI
        # 原理: 如果文本提取连税率/税额都找不到,说明PDF文本质量差,提取到的金额也很不可靠
        text_has_tax_info = bool(result.get('tax_rate') or result.get('tax_amount') or result.get('is_multi_rate'))
        ai_has_tax_info = bool(ai_result.get('tax_rate') or ai_result.get('tax_amount') or ai_result.get('is_multi_rate'))
        if result['amount'] and ai_result.get('amount') and not text_has_tax_info and ai_has_tax_info:
            txt_amt = _safe_float(result['amount'])
            ai_amt = _safe_float(ai_result['amount'])
            if txt_amt and ai_amt and abs(txt_amt - ai_amt) > 1:  # 差异超过1元
                log.warning(f"⚠️ 文本金额不可靠(无税务佐证): 文本={result['amount']} vs AI={ai_result['amount']} → 采用AI金额")
                result['amount'] = ai_result['amount']  # 用AI覆盖不可靠的文本金额
                ai_result['amount'] = None  # 标记已使用,后续不重复填充

        for key in ('amount', 'tax_rate', 'tax_amount'):
            if not result.get(key) and ai_result.get(key):
                result[key] = ai_result[key]
                result['method'] = ai_result['method']
                result['source'] = 'ai' if result['source'] == 'none' else 'text+ai'
        if ai_result.get('is_multi_rate') and not result.get('is_multi_rate'):
            result['is_multi_rate'] = True

    return result


# ========== v2.5.14 新增：天气接口 ==========

WEATHER_CACHE = {'data': None, 'ts': 0}
WEATHER_TTL = 1800  # 30 min

def _weather_icon(code):
    """wttr.in weather code -> emoji"""
    m = {'113': '\u2600\uFE0F', '116': '\u26C5', '119': '\u2601\uFE0F', '122': '\u2601\uFE0F',
         '143': '\U0001F32B\uFE0F', '176': '\U0001F326\uFE0F', '200': '\u26C8\uFE0F',
         '227': '\U0001F328\uFE0F', '230': '\u2744\uFE0F', '248': '\U0001F32B\uFE0F',
         '260': '\U0001F32B\uFE0F', '263': '\U0001F327\uFE0F', '266': '\U0001F327\uFE0F',
         '293': '\U0001F327\uFE0F', '296': '\U0001F327\uFE0F', '299': '\U0001F327\uFE0F',
         '302': '\U0001F327\uFE0F', '305': '\U0001F327\uFE0F', '308': '\U0001F327\uFE0F',
         '323': '\U0001F328\uFE0F', '326': '\U0001F328\uFE0F', '329': '\u2744\uFE0F',
         '332': '\u2744\uFE0F', '335': '\u2744\uFE0F', '338': '\u2744\uFE0F',
         '353': '\U0001F326\uFE0F', '356': '\U0001F327\uFE0F', '359': '\U0001F327\uFE0F',
         '386': '\u26C8\uFE0F', '389': '\u26C8\uFE0F', '395': '\u2744\uFE0F'}
    return m.get(str(code), '\U0001F324\uFE0F')


def _get_proxies():
    """Auto-detect Windows system proxy (corporate network support)"""
    try:
        import urllib.request
        proxies = urllib.request.getproxies()
        if proxies:
            log.info(f'Detected system proxy: {proxies}')
        return proxies or None
    except Exception:
        return None


def get_weather():
    """IP auto-detect city + wttr.in weather, 30min cache, with system proxy support"""
    now = time.time()
    if WEATHER_CACHE['data'] and (now - WEATHER_CACHE['ts']) < WEATHER_TTL:
        return WEATHER_CACHE['data']

    result = {'city': '', 'weather': '', 'temp': '', 'humidity': '', 'wind': '', 'icon': '\U0001F324\uFE0F'}
    proxies = _get_proxies()

    # Step 1: IP geolocation
    try:
        loc = requests.get('http://ip-api.com/json/?lang=zh-CN', timeout=5, proxies=proxies).json()
        city = loc.get('city', '')
        result['city'] = city or '\u672A\u77E5'
    except Exception as e:
        log.warning(f'IP\u5B9A\u4F4D\u5931\u8D25: {e}')
        result['city'] = '\u672A\u77E5'

    # Step 2: Weather by city
    if result['city'] not in ('', '\u672A\u77E5'):
        try:
            w = requests.get('https://wttr.in/' + result['city'] + '?format=j1&lang=zh', timeout=8, proxies=proxies).json()
            c = w.get('current_condition', [{}])[0]
            desc = c.get('lang_zh', [{}])[0].get('value', c.get('weatherDesc', [{}])[0].get('value', ''))
            result.update({
                'weather': desc,
                'temp': c.get('temp_C', '') + '\u00B0C',
                'humidity': '\u6E7F\u5EA6' + c.get('humidity', '') + '%',
                'wind': c.get('winddir16Point', '') + ' ' + c.get('windspeedKmph', '') + 'km/h',
                'icon': _weather_icon(c.get('weatherCode', ''))
            })
        except Exception as e:
            log.warning(f'\u5929\u6C14\u83B7\u53D6\u5931\u8D25: {e}')

    # Step 3: If both failed, try China weather API fallback (seniverse)
    if not result['weather']:
        try:
            w = requests.get('https://api.seniverse.com/v3/weather/now.json?key=SyCeZyEsoCzfhKnDR&location=ip&language=zh-Hans', timeout=5, proxies=proxies).json()
            loc_data = w.get('results', [{}])[0]
            loc_info = loc_data.get('location', {})
            now_data = loc_data.get('now', {})
            result.update({
                'city': loc_info.get('name', result['city']),
                'weather': now_data.get('text', ''),
                'temp': now_data.get('temperature', '') + '\u00B0C',
                'humidity': '',
                'wind': now_data.get('wind_direction', '') + ' ' + now_data.get('wind_speed', '') + 'km/h',
                'icon': '\U0001F324\uFE0F'
            })
            log.info(f'China weather API fallback: {result["city"]} {result["weather"]}')
        except Exception as e:
            log.warning(f'\u5907\u7528\u5929\u6C14API\u4E5F\u5931\u8D25: {e}')

    WEATHER_CACHE['data'] = result
    WEATHER_CACHE['ts'] = now
    return result


class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            if self.path == '/check-invoice':
                self._handle_check_invoice()
            elif self.path == '/extract-detail':
                self._handle_extract_detail()
            elif self.path == '/verify':
                # v3.0.36: 提交再检查 — 对比模式（AI识别值 vs 用户填写值）
                self._handle_verify()
            elif self.path == '/weather':
                self._handle_weather()
            else:
                log.warning(f"[请求] 未知POST路径: {self.path}")
                self.send_error(404)
        except Exception as e:
            log.error(f"[错误] {self.path} 未捕获异常: {e}\n{traceback.format_exc()}")
            try:
                self._json({'error': str(e)}, 500)
            except Exception:
                pass

    def _handle_check_invoice(self):
        """v2.4 原有：发票类型校验"""
        try:
            length = int(self.headers.get('Content-Length', 0))
            data = json.loads(self.rfile.read(length))
            fd = data.get('file_data'); fn = data.get('file_name', 'unknown'); st = data.get('selected_type', '')
            if not fd: self._json({'error': '缺少文件数据'}, 400); return
            log.info(f"[请求] /check-invoice 文件={fn} 用户选={st} 大小={len(fd)//1024}KB")
            detected, ai_resp, number, title, buyer = check_ai(fd, fn)
            is_match = (detected == st) or (detected == '其他' and st == '其他')
            num_len = len(number) if number else 0
            num_valid = num_len in (8, 20)
            log.info(f"[结果] /check-invoice AI={detected} 匹配={is_match} 号码={number}({num_len}位{'✓' if num_valid else '✗'}) 购买方={buyer}")
            self._json({
                'detected_type': detected,
                'selected_type': st,
                'is_match': is_match,
                'ai_response': ai_resp,
                'invoice_number': number,
                'invoice_title': title,
                'invoice_number_length': num_len,
                'invoice_number_valid': num_valid,
                'invoice_buyer': buyer
            })
        except Exception as e:
            log.error(f"[错误] /check-invoice: {e}\n{traceback.format_exc()}")
            self._json({'error': str(e)}, 500)

    def _handle_extract_detail(self):
        """v2.5.0 新增：发票金额提取"""
        try:
            length = int(self.headers.get('Content-Length', 0))
            data = json.loads(self.rfile.read(length))
            fd = data.get('file_data')
            fn = data.get('file_name', 'unknown')
            st = data.get('selected_type', '')
            if not fd:
                self._json({'error': '缺少文件数据'}, 400)
                return
            log.info(f"[请求] /extract-detail 文件={fn} 类型={st} 大小={len(fd)//1024}KB")
            result = extract_detail(fd, fn, st)
            result['selected_type'] = st
            log.info(f"[结果] /extract-detail amount={result.get('amount')} rate={result.get('tax_rate')} tax={result.get('tax_amount')} multi={result.get('is_multi_rate')} source={result.get('source')}")
            self._json(result)
        except Exception as e:
            log.error(f"[错误] /extract-detail: {e}\n{traceback.format_exc()}")
            self._json({'error': str(e)}, 500)

    def _handle_weather(self):
        """v2.5.14 新增：天气查询"""
        try:
            log.info(f"[请求] /weather")
            result = get_weather()
            log.info(f"[结果] /weather city={result.get('city')} temp={result.get('temp')}")
            self._json(result)
        except Exception as e:
            log.error(f"[错误] /weather: {e}\n{traceback.format_exc()}")
            self._json({'error': str(e)}, 500)

    def _handle_verify(self):
        """v3.0.36: 提交再检查 — 对比校验模式
        接收用户填写的表单数据 + 附件文件，用AI重新识别发票，
        返回所有识别结果供前端对比生成报告。
        """
        try:
            length = int(self.headers.get('Content-Length', 0))
            data = json.loads(self.rfile.read(length))
            fd = data.get('file_data')
            fn = data.get('file_name', 'unknown')
            form_data = data.get('form_data', {})  # 用户填写的数据
            mode = data.get('mode', 'compare')

            if not fd:
                self._json({'error': '缺少文件数据'}, 400)
                return

            log.info(f"[请求] /verify 文件={fn} mode={mode} 表单数据={json.dumps(form_data, ensure_ascii=False)}")

            # 步骤1: 调用 AI 发票类型识别（获取发票号、购买方、销售方等）
            detected_type, ai_raw, invoice_number, title, buyer = check_ai(fd, fn)

            # 步骤2: 调用金额提取（获取金额、税率、税额）
            detail_result = extract_detail(fd, fn, detected_type)

            # 步骤3: 尝试从 AI 原始响应中提取销售方（如果有的话）
            seller = ''
            try:
                # AI 返回的原始文本中可能包含销售方信息
                if ai_raw and isinstance(ai_raw, str):
                    # 常见格式："销售方：xxx" 或 "卖方名称：xxx"
                    seller_match = re.search(r'(?:销售方|卖方名称|销货单位)[：:]\s*(.+?)(?:\n|$|购买方|买方)', ai_raw)
                    if seller_match:
                        seller = seller_match.group(1).strip()
            except Exception:
                pass

            result = {
                'detected_type': detected_type,
                'invoice_number': invoice_number,
                'invoice_buyer': buyer,
                'invoice_seller': seller,
                'invoice_title': title,
                # 明细数据
                'amount': detail_result.get('amount', ''),
                'tax_rate': detail_result.get('tax_rate', ''),
                'tax_amount': detail_result.get('tax_amount', ''),
                'is_multi_rate': detail_result.get('is_multi_rate', False),
                'amount_source': detail_result.get('source', ''),
                # 原始表单数据（回传供前端对比使用）
                'form_data_received': form_data,
                'ai_raw': ai_raw[:2000] if ai_raw else ''  # 截断避免过大
            }

            log.info(f"[结果] /verify 类型={detected_type} 号={invoice_number} 购买方={buyer} 销售方={seller} 金额={detail_result.get('amount')}")
            self._json(result)
        except Exception as e:
            log.error(f"[错误] /verify: {e}\n{traceback.format_exc()}")
            self._json({'error': str(e)}, 500)

    def do_GET(self):
        try:
            if self.path == '/test':
                self._json({'status': 'ok', 'version': VERSION, 'port': PORT})
            elif self.path == '/health':
                health = {'status': 'ok', 'version': VERSION, 'port': PORT, 'deps': {}}
                try:
                    import fitz
                    health['deps']['PyMuPDF'] = {'ok': True, 'version': fitz.version[0]}
                except ImportError as e:
                    health['deps']['PyMuPDF'] = {'ok': False, 'error': str(e)}
                    health['status'] = 'degraded'
                except Exception as e:
                    health['deps']['PyMuPDF'] = {'ok': False, 'error': str(e)}
                    health['status'] = 'degraded'
                try:
                    import requests as _req
                    health['deps']['requests'] = {'ok': True, 'version': _req.__version__}
                except ImportError:
                    health['deps']['requests'] = {'ok': False, 'error': 'not installed'}
                    health['status'] = 'broken'
                try:
                    import pypdf as _pp
                    health['deps']['pypdf'] = {'ok': True, 'version': _pp.__version__}
                except ImportError:
                    health['deps']['pypdf'] = {'ok': False, 'error': 'not installed'}
                self._json(health)
            elif self.path == '/':
                self._json({'service': 'Invoice Checker', 'version': VERSION, 'port': PORT, 'uptime': 'running'})
            else:
                log.debug(f"[请求] GET {self.path} → 404")
                self.send_error(404)
        except Exception as e:
            log.error(f"[错误] GET {self.path}: {e}\n{traceback.format_exc()}")

    def _json(self, data, code=200):
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps(data, ensure_ascii=False).encode())

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST,OPTIONS,GET')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def log_message(self, format, *args):
        """重写 HTTP 服务器默认日志，接入我们的日志系统"""
        log.debug(f"HTTP {self.client_address[0]} {format % args}")


if __name__ == '__main__':
    def _fitz_ok():
        try:
            import fitz; return True
        except: return False

    server = ThreadingHTTPServer(('127.0.0.1', PORT), Handler)
    log.info("=" * 60)
    log.info(f"[启动] 发票检查服务 v{VERSION} 端口 {PORT} PID={os.getpid()}")
    log.info(f"[启动] Python {sys.version.split()[0]}, 平台 {sys.platform}")
    log.info(f"[启动] 日志文件: {LOG_FILE}")
    log.info(f"[启动] 依赖: fitz={'OK' if _fitz_ok() else 'N/A'}, pypdf={'OK' if HAS_PYPDF else 'N/A'}, requests OK")
    log.info(f"[启动] API: GLM-4V-Flash @ {API_URL}")
    log.info(f"[启动] 接口: /check-invoice /extract-detail /weather /health /test")
    log.info("=" * 60)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        log.info("[停止] 服务收到中断信号, 正在关闭...")
        server.server_close()
        log.info("[停止] 服务已关闭")
    except Exception as e:
        log.error(f"[崩溃] 服务异常退出: {e}\n{traceback.format_exc()}")

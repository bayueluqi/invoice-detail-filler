"""Download good v2.5.12 files from cloud and overwrite local copies"""
import urllib.request, os, sys

BASE = r'D:\TEMP\COZE\invoice-detail-filler'
urls = {
    'https://www.coze.cn/s/BtSYqmIklrg/': os.path.join(BASE, 'chrome-extension', 'content.js'),
    'https://www.coze.cn/s/BbXVo1gCJcU/': os.path.join(BASE, 'python-service', 'invoice_checker.py'),
}

for url, target in urls.items():
    print(f"\nDownloading {os.path.basename(target)}...")
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        resp = urllib.request.urlopen(req, timeout=30)
        data = resp.read()
        print(f"  Downloaded: {len(data)} bytes")
        
        # Write as binary to avoid encoding issues
        with open(target, 'wb') as f:
            f.write(data)
        print(f"  Written to: {target}")
        
        # Verify
        with open(target, 'rb') as f:
            verify = f.read()
        print(f"  Verified: {len(verify)} bytes, match={verify == data}")
    except Exception as e:
        print(f"  ERROR: {e}")

# Final syntax checks
print("\n--- Final Verification ---")
content_js = os.path.join(BASE, 'chrome-extension', 'content.js')
py_file = os.path.join(BASE, 'python-service', 'invoice_checker.py')

# Check bracket balance for content.js
with open(content_js, 'r', encoding='utf-8') as f:
    js_text = f.read()
curlies = js_text.count('{') - js_text.count('}')
parens = js_text.count('(') - js_text.count(')')
brackets = js_text.count('[') - js_text.count(']')
print(f"content.js braces: {{}}={curlies}, ()={parens}, []={brackets} {'PERFECT' if curlies==0 and parens==0 and brackets==0 else 'UNBALANCED!'}")

# Node syntax check
import subprocess
r = subprocess.run(['node', '-c', content_js], capture_output=True, text=True, timeout=10)
print(f"content.js node syntax: {'OK' if r.returncode==0 else 'FAILED'}")
if r.returncode != 0:
    print(f"  {r.stderr[:300]}")

# Python syntax check
import ast
with open(py_file, 'r', encoding='utf-8') as f:
    py_text = f.read()
try:
    ast.parse(py_text)
    print("invoice_checker.py syntax: OK")
except SyntaxError as e:
    print(f"invoice_checker.py syntax: FAILED - line {e.lineno}: {e.msg}")

print("\nDONE - Now reload the extension in chrome://extensions")

"""Update all version strings in invoice_checker.py from 2.5.0 to 2.5.12"""
import re

PY = r'D:\TEMP\COZE\invoice-detail-filler\python-service\invoice_checker.py'
with open(PY, 'r', encoding='utf-8') as f:
    text = f.read()

# Replace version strings carefully
# 1. Startup log: v2.5.0 -> v2.5.12
text = text.replace('发票检查服务 v2.5.0', '发票检查服务 v2.5.12')

# 2. /test endpoint version
text = text.replace("'version': '2.5.0', 'port': PORT)", "'version': '2.5.12', 'port': PORT)")

# 3. /health endpoint version (appears twice - once in initial dict, once potentially)
text = text.replace("'version': '2.5.0', 'port': PORT, 'deps'", "'version': '2.5.12', 'port': PORT, 'deps'")

# 4. /health fallback
text = text.replace("'service': 'Invoice Checker', 'version': '2.5.0'", "'service': 'Invoice Checker', 'version': '2.5.12'")

with open(PY, 'w', encoding='utf-8', newline='\n') as f:
    f.write(text)

# Verify
with open(PY, 'r', encoding='utf-8') as f:
    verify = f.read()

count_250 = verify.count('2.5.0')
count_2512 = verify.count('2.5.12')
print(f"Remaining '2.5.0': {count_250}")
print(f"'2.5.12' count: {count_2512}")

# Check syntax
import ast
try:
    ast.parse(verify)
    print("Python syntax: OK")
except SyntaxError as e:
    print(f"Python syntax: FAILED - line {e.lineno}: {e.msg}")

print("DONE")

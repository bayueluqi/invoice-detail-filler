#!/usr/bin/env python3
"""Diagnose invoice-detail-filler issues + init git"""
import subprocess, os, sys, json

BASE = r'D:\TEMP\COZE\invoice-detail-filler'
CHROME = os.path.join(BASE, 'chrome-extension')
PY = os.path.join(BASE, 'python-service')

print("=" * 60)
print("DIAGNOSTIC REPORT - invoice-detail-filler")
print("=" * 60)

# 1. Check encoding/BOM/size of all files
for subdir, files in [
    (CHROME, ['content.js', 'background.js', 'manifest.json']),
    (PY, ['invoice_checker.py']),
    (BASE, [s for s in os.listdir(BASE) if s.endswith('.bat')]),
]:
    for fn in files:
        fp = os.path.join(subdir, fn)
        if not os.path.exists(fp):
            print(f"\n[MISSING] {fn}")
            continue
        with open(fp, 'rb') as f:
            data = f.read()
        bom = data[:3] == b'\xef\xbb\xbf'
        crlf = data.count(b'\r\n')
        lf_only = data.count(b'\n') - crlf
        print(f"\n{fn}: {len(data)} bytes, BOM={bom}, CRLF={crlf}, LF-only={lf_only}")
        try:
            data.decode('utf-8')
            print(f"  UTF-8: OK")
        except Exception as e:
            print(f"  UTF-8: FAILED - {e}")

# 2. Check JS syntax with node
content_js = os.path.join(CHROME, 'content.js')
bg_js = os.path.join(CHROME, 'background.js')
for js_file in [content_js, bg_js]:
    if os.path.exists(js_file):
        r = subprocess.run(['node', '-c', js_file], capture_output=True, text=True, timeout=10)
        status = "OK" if r.returncode == 0 else "FAILED"
        print(f"\n{os.path.basename(js_file)} node syntax: {status}")
        if r.returncode != 0:
            print(f"  {r.stderr[:500]}")

# 3. Check Python syntax
py_file = os.path.join(PY, 'invoice_checker.py')
if os.path.exists(py_file):
    r = subprocess.run([sys.executable, '-c',
        f'import ast; ast.parse(open(r"{py_file}",encoding="utf-8").read()); print("OK")'],
        capture_output=True, text=True, timeout=10)
    print(f"\ninvoice_checker.py syntax: {'OK' if r.returncode==0 else 'FAILED'}")
    if r.returncode != 0:
        print(f"  {r.stderr[:500]}")

# 4. Check if port 52100 is in use
r = subprocess.run(['netstat', '-ano'], capture_output=True, text=True, timeout=10)
for line in r.stdout.split('\n'):
    if '52100' in line:
        print(f"\nPort 52100 in use: {line.strip()}")

# 5. Try starting Python service briefly to see if it works
print("\n--- Testing Python service startup (3 sec) ---")
try:
    proc = subprocess.Popen(
        [sys.executable, py_file],
        stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        cwd=PY, creationflags=0x00000008  # DETACHED_PROCESS
    )
    import time
    time.sleep(3)
    # Try to hit /test endpoint
    try:
        import urllib.request
        resp = urllib.request.urlopen('http://127.0.0.1:52100/test', timeout=3)
        print(f"  /test response: {resp.read().decode()}")
    except Exception as e:
        print(f"  /test failed: {e}")
    proc.terminate()
    proc.wait(timeout=5)
    print("  Process terminated")
except Exception as e:
    print(f"  Service test error: {e}")

# 6. Git init
print("\n--- Git Setup ---")
os.chdir(BASE)
if not os.path.exists(os.path.join(BASE, '.git')):
    r = subprocess.run(['git', 'init', BASE], capture_output=True, text=True)
    print(f"git init: {r.stdout.strip()}")
else:
    print("git already initialized")

subprocess.run(['git', 'config', 'core.autocrlf', 'false'], capture_output=True)
subprocess.run(['git', 'config', 'user.email', 'luqi@utsc.com'], capture_output=True)
subprocess.run(['git', 'config', 'user.name', 'Lu Qi'], capture_output=True)

# .gitignore
gitignore = "__pycache__/\n*.pyc\n.DS_Store\n*.tmp\n"
with open(os.path.join(BASE, '.gitignore'), 'w', encoding='utf-8') as f:
    f.write(gitignore)
print("Created .gitignore")

subprocess.run(['git', 'add', '-A'], capture_output=True)
r = subprocess.run(['git', 'commit', '-m', 'v2.5.12 - initial commit with git'], capture_output=True, text=True)
print(f"git commit: exit={r.returncode}")
if r.stdout: print(f"  {r.stdout[:300]}")
if r.stderr: print(f"  {r.stderr[:300]}")

print("\n" + "=" * 60)
print("DIAGNOSTIC COMPLETE")
print("=" * 60)

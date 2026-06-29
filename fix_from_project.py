"""Download content.js from project and copy to chrome-extension dir"""
import subprocess, shutil, os, json

BASE = r'D:\TEMP\COZE\invoice-detail-filler'
CHROME = os.path.join(BASE, 'chrome-extension')
TARGET = os.path.join(CHROME, 'content.js')

# Download to BASE directory first
print("Downloading content.js from project...")
r = subprocess.run(
    ['coze', 'agent', 'file', 'download', '--project-id', '7654499327599182086', '--project-file-path', '/用户上传/content.js'],
    capture_output=True, text=True, cwd=BASE
)
print(f"  exit={r.returncode}")
print(f"  stdout={r.stdout[:500]}")
if r.stderr:
    print(f"  stderr={r.stderr[:500]}")

# Find the downloaded file - it might be in BASE with the full path structure
downloaded = os.path.join(BASE, 'content.js')
if not os.path.exists(downloaded):
    # Try looking in subdirectories
    for root, dirs, files in os.walk(BASE):
        if 'content.js' in files and 'chrome-extension' not in root:
            downloaded = os.path.join(root, 'content.js')
            break

if not os.path.exists(downloaded):
    print(f"ERROR: Downloaded file not found at {downloaded}")
    # List files in BASE
    for f in os.listdir(BASE):
        print(f"  {f}")
    exit(1)

# Check downloaded file
with open(downloaded, 'rb') as f:
    data = f.read()
print(f"Downloaded: {len(data)} bytes")

# Verify bracket balance
text = data.decode('utf-8')
curlies = text.count('{') - text.count('}')
parens = text.count('(') - text.count(')')
brackets = text.count('[') - text.count(']')
print(f"Brace balance: {{}}={curlies}, ()={parens}, []={brackets}")

if curlies == 0 and parens == 0 and brackets == 0:
    print("Bracket balance: PERFECT")
else:
    print("WARNING: Brackets NOT balanced!")

# Copy to target
shutil.copy2(downloaded, TARGET)
print(f"Copied to {TARGET}")

# Verify target
with open(TARGET, 'rb') as f:
    tdata = f.read()
print(f"Target file: {len(tdata)} bytes")
print(f"Match: {tdata == data}")

# Also download and overwrite invoice_checker.py
print("\nDownloading invoice_checker.py from project...")
r = subprocess.run(
    ['coze', 'agent', 'file', 'download', '--project-id', '7654499327599182086', '--project-file-path', '/用户上传/invoice_checker.py'],
    capture_output=True, text=True, cwd=BASE
)
print(f"  exit={r.returncode}")
if r.stdout: print(f"  stdout={r.stdout[:300]}")

dl_py = os.path.join(BASE, 'invoice_checker.py')
if os.path.exists(dl_py):
    with open(dl_py, 'rb') as f:
        pydata = f.read()
    print(f"Downloaded: {len(pydata)} bytes")
    shutil.copy2(dl_py, os.path.join(BASE, 'python-service', 'invoice_checker.py'))
    print(f"Copied to python-service/invoice_checker.py")
else:
    print("  invoice_checker.py not found after download")

# Verify both files with node/python
print("\n--- Final Verification ---")
r = subprocess.run(['node', '-c', TARGET], capture_output=True, text=True, timeout=10)
print(f"content.js node syntax: {'OK' if r.returncode==0 else 'FAILED'}")
if r.returncode != 0:
    print(f"  {r.stderr[:300]}")

PY_TARGET = os.path.join(BASE, 'python-service', 'invoice_checker.py')
r = subprocess.run(['python', '-c', f'import ast; ast.parse(open(r"{PY_TARGET}",encoding="utf-8").read()); print("OK")'],
    capture_output=True, text=True, timeout=10)
print(f"invoice_checker.py syntax: {'OK' if r.returncode==0 else 'FAILED'}")
if r.returncode != 0:
    print(f"  {r.stderr[:300]}")

# Clean up downloaded files from BASE
for f in ['content.js', 'invoice_checker.py']:
    fp = os.path.join(BASE, f)
    if os.path.exists(fp):
        os.remove(fp)
        print(f"Cleaned up: {fp}")

print("\nDONE")

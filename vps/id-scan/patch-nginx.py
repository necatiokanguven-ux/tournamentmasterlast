import paramiko
import sys

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect("72.62.31.173", username="root", password="@Pl1755551755", timeout=30)

patch_script = r"""
from pathlib import Path
path = Path('/etc/nginx/sites-enabled/api-pokerclup')
text = path.read_text()
snippet = '''    location /api/id-scan/ {
        proxy_pass http://127.0.0.1:3010/api/id-scan/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        client_max_body_size 8m;
    }'''
if 'location /api/id-scan/' not in text:
    text = text.replace('    location / {', snippet + '\n\n    location / {', 1)
    path.write_text(text)
    print('nginx patched')
else:
    print('already patched')
"""

sftp = ssh.open_sftp()
with sftp.file("/tmp/patch_nginx_idscan.py", "w") as f:
    f.write(patch_script)
sftp.close()

for cmd in [
    "python3 /tmp/patch_nginx_idscan.py",
    "nginx -t",
    "systemctl reload nginx",
    "curl -s https://api.pokerclup.com/api/id-scan/health",
    "curl -s 'https://api.pokerclup.com/api/id-scan/status?licenseKey=test&machineId=test'",
]:
    print(">", cmd)
    _stdin, stdout, stderr = ssh.exec_command(cmd, timeout=30)
    out = stdout.read().decode("utf-8", "replace")
    err = stderr.read().decode("utf-8", "replace")
    if out.strip():
        print(out)
    if err.strip():
        print("ERR:", err)

ssh.close()

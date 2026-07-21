"""Deploy PokerClup ID Scan API to VPS (one-shot). Requires GEMINI_API_KEY env var."""

from __future__ import annotations

import os
import sys

import paramiko

HOST = os.environ.get("TM_VPS_HOST", "72.62.31.173")
USER = os.environ.get("TM_VPS_USER", "root")
PASSWORD = os.environ.get("TM_VPS_PASS", "")
GEMINI_KEY = os.environ.get("GEMINI_API_KEY", "").strip()
APP_DIR = "/var/www/pokerclup-id-scan"
REPO = "https://github.com/necatiokanguven-ux/tournamentmasterlast.git"
BRANCH = "master"

NGINX_SNIPPET = """
    location /api/id-scan/ {
        proxy_pass http://127.0.0.1:3010/api/id-scan/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        client_max_body_size 8m;
    }
"""

REMOTE_SCRIPT = r"""#!/bin/bash
set -euo pipefail
APP_DIR="__APP_DIR__"
REPO="__REPO__"
BRANCH="__BRANCH__"
GEMINI_KEY="__GEMINI_KEY__"

if [ -z "$GEMINI_KEY" ]; then
  echo "GEMINI_API_KEY missing"
  exit 1
fi

if [ ! -d "$APP_DIR/.git" ]; then
  mkdir -p "$APP_DIR"
  git clone --depth 1 -b "$BRANCH" "$REPO" "$APP_DIR"
else
  cd "$APP_DIR"
  git fetch origin "$BRANCH"
  git reset --hard "origin/$BRANCH"
fi

cd "$APP_DIR/vps/id-scan"
cat > .env.local <<EOF
GEMINI_API_KEY=${GEMINI_KEY}
GEMINI_MODEL=gemini-2.5-flash-lite
LICENSE_API_URL=https://api.pokerclup.com/api/licenses
PORT=3010
EOF
chmod 600 .env.local

npm install --no-audit --no-fund

if command -v pm2 >/dev/null 2>&1; then
  pm2 delete pokerclup-id-scan 2>/dev/null || true
  pm2 start npm --name pokerclup-id-scan --cwd "$APP_DIR/vps/id-scan" -- run start
  pm2 save
else
  echo "PM2 not found"
  exit 1
fi

sleep 2
curl -sf http://127.0.0.1:3010/api/id-scan/health
echo ""
echo "id-scan health OK"
"""


def run(ssh: paramiko.SSHClient, cmd: str, timeout: int = 600) -> tuple[int, str, str]:
    print(">", cmd[:120].replace(GEMINI_KEY, "***") if GEMINI_KEY else cmd[:120])
    _stdin, stdout, stderr = ssh.exec_command(cmd, timeout=timeout)
    out = stdout.read().decode("utf-8", errors="replace")
    err = stderr.read().decode("utf-8", errors="replace")
    code = stdout.channel.recv_exit_status()
    return code, out, err


def main() -> int:
    if not GEMINI_KEY:
        print("Set GEMINI_API_KEY environment variable.", file=sys.stderr)
        return 1
    if not PASSWORD:
        PASSWORD_LOCAL = "@Pl1755551755"
    else:
        PASSWORD_LOCAL = PASSWORD

    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username=USER, password=PASSWORD_LOCAL, timeout=60)

    remote = (
        REMOTE_SCRIPT.replace("__APP_DIR__", APP_DIR)
        .replace("__REPO__", REPO)
        .replace("__BRANCH__", BRANCH)
        .replace("__GEMINI_KEY__", GEMINI_KEY)
    )

    sftp = ssh.open_sftp()
    remote_path = "/tmp/deploy-id-scan.sh"
    with sftp.file(remote_path, "w") as handle:
        handle.write(remote)
    sftp.chmod(remote_path, 0o700)
    sftp.close()

    code, out, err = run(ssh, f"bash {remote_path}", timeout=900)
    if out.strip():
        print(out)
    if err.strip():
        print(err, file=sys.stderr)
    if code != 0:
        return code

    # nginx: inject location block if missing
    code, out, _err = run(ssh, "grep -q 'location /api/id-scan/' /etc/nginx/sites-enabled/api-pokerclup && echo has-block || echo missing-block")
    if "missing-block" in out:
        patch_cmd = (
            "python3 - <<'PY'\n"
            "from pathlib import Path\n"
            "path = Path('/etc/nginx/sites-enabled/api-pokerclup')\n"
            "text = path.read_text()\n"
            "snippet = '''" + NGINX_SNIPPET.strip() + "'''\n"
            "if 'location /api/id-scan/' not in text:\n"
            "    text = text.replace('    location / {', snippet + '\\n\\n    location / {', 1)\n"
            "    path.write_text(text)\n"
            "    print('nginx patched')\n"
            "else:\n"
            "    print('nginx already patched')\n"
            "PY\n"
            "nginx -t && systemctl reload nginx"
        )
        code, out, err = run(ssh, patch_cmd, timeout=120)
        print(out)
        if err.strip():
            print(err, file=sys.stderr)
        if code != 0:
            return code

    code, out, err = run(ssh, "curl -sf https://api.pokerclup.com/api/id-scan/health")
    print("Public health:", out.strip())
    ssh.close()
    return 0 if code == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())

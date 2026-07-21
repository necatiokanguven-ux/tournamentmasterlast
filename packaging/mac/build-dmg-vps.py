"""Upload Tournament Master.app to VPS, build TourMasterMac.dmg, download result."""

from __future__ import annotations

import os
import sys
from pathlib import Path

import paramiko


def run(ssh: paramiko.SSHClient, cmd: str, timeout: int = 900) -> None:
    print(">", cmd)
    _stdin, stdout, stderr = ssh.exec_command(cmd, timeout=timeout)
    out = stdout.read().decode("utf-8", errors="replace")
    err = stderr.read().decode("utf-8", errors="replace")
    code = stdout.channel.recv_exit_status()
    if out.strip():
        print(out.rstrip())
    if err.strip():
        print(err.rstrip(), file=sys.stderr)
    if code != 0:
        raise RuntimeError(f"Command failed ({code}): {cmd}")


def main() -> int:
    if len(sys.argv) < 8:
        print(
            "Usage: build-dmg-vps.py <host> <user> <password> "
            "<local_tar> <local_script> <local_dmg> <remote_work> "
            "<remote_app> <remote_dmg> <remote_script>"
        )
        return 1

    host = sys.argv[1]
    user = sys.argv[2]
    password = sys.argv[3]
    local_tar = sys.argv[4]
    local_script = sys.argv[5]
    local_dmg = sys.argv[6]
    remote_work = sys.argv[7]
    remote_app = sys.argv[8]
    remote_dmg = sys.argv[9]
    remote_script = sys.argv[10]

    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(host, username=user, password=password, timeout=60)
    sftp = ssh.open_sftp()

    try:
        run(ssh, f"rm -rf {remote_work} && mkdir -p {remote_work}")
        sftp.put(local_tar, f"{remote_work}/app.tar.gz")
        sftp.put(local_script, remote_script)
        run(ssh, f"chmod +x {remote_script}")
        run(ssh, f"tar -xzf {remote_work}/app.tar.gz -C {remote_work}")
        run(ssh, f'bash {remote_script} "{remote_app}" {remote_dmg}')
        Path(local_dmg).parent.mkdir(parents=True, exist_ok=True)
        sftp.get(remote_dmg, local_dmg)
        run(ssh, f"rm -rf {remote_work}")
    finally:
        sftp.close()
        ssh.close()

    print("DMG downloaded:", local_dmg)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

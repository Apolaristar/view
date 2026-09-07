from __future__ import annotations

import os
import socket
import subprocess
import time
import urllib.request
from pathlib import Path


def test_packaged_backend_exe_health(tmp_path):
    exe = Path(__file__).resolve().parents[1] / "dist" / "backend.exe"
    assert exe.is_file(), "backend.exe 未生成，第 6 周打包未完成"
    sock = socket.socket()
    sock.bind(("127.0.0.1", 0))
    port = sock.getsockname()[1]
    sock.close()
    env = os.environ.copy()
    env["POSEBOARD_DATA_DIR"] = str(tmp_path)
    env["POSEBOARD_DISABLE_WORKER"] = "1"
    proc = subprocess.Popen(
        [str(exe), "--port", str(port)],
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )
    try:
        deadline = time.time() + 60
        last = None
        while time.time() < deadline:
            try:
                with urllib.request.urlopen(f"http://127.0.0.1:{port}/health", timeout=2) as res:
                    body = res.read().decode("utf-8")
                    assert '"ok"' in body
                    return
            except Exception as exc:  # noqa: BLE001
                last = exc
                time.sleep(0.5)
        raise AssertionError(f"backend.exe 未就绪: {last}")
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=8)
        except subprocess.TimeoutExpired:
            proc.kill()

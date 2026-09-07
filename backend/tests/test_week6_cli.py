from __future__ import annotations

import os
import socket
import subprocess
import sys
import time
from pathlib import Path

import httpx


def test_main_cli_serves_health(tmp_path, monkeypatch):
    monkeypatch.setenv("POSEBOARD_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("POSEBOARD_DISABLE_WORKER", "1")
    sock = socket.socket()
    sock.bind(("127.0.0.1", 0))
    port = sock.getsockname()[1]
    sock.close()
    env = os.environ.copy()
    env["POSEBOARD_DATA_DIR"] = str(tmp_path)
    env["POSEBOARD_DISABLE_WORKER"] = "1"
    proc = subprocess.Popen(
        [sys.executable, "main.py", "--port", str(port)],
        cwd=str(Path(__file__).resolve().parents[1]),
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )
    try:
        deadline = time.time() + 20
        last_err = None
        while time.time() < deadline:
            try:
                res = httpx.get(f"http://127.0.0.1:{port}/health", timeout=1)
                if res.status_code == 200 and res.json().get("status") == "ok":
                    return
            except Exception as exc:  # noqa: BLE001
                last_err = exc
            time.sleep(0.3)
        out = proc.stdout.read() if proc.stdout else ""
        raise AssertionError(f"server did not become healthy: {last_err}\n{out}")
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()

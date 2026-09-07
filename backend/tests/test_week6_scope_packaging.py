from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


def test_nav_matches_prd_four_items():
    nav = json.loads((ROOT / "shared" / "nav.json").read_text(encoding="utf-8"))
    assert [i["key"] for i in nav] == ["/", "/library", "/boards", "/settings"]
    assert [i["label"] for i in nav] == ["首页", "图库", "画板", "设置"]
    text = json.dumps(nav, ensure_ascii=False)
    for forbidden in ("计划", "健身", "咨询", "饮食", "游戏", "自媒体"):
        assert forbidden not in text


def test_frontend_nav_source_has_no_life_modules():
    src = (ROOT / "frontend" / "src" / "nav.ts").read_text(encoding="utf-8")
    for forbidden in ("计划", "健身", "咨询", "饮食", "游戏", "自媒体", "画笔", "导出长图"):
        assert forbidden not in src


def test_board_canvas_has_no_brush_or_export():
    src = (ROOT / "frontend" / "src" / "pages" / "BoardCanvas.tsx").read_text(encoding="utf-8")
    assert "画笔" not in src
    assert "导出长图" not in src
    assert "笔刷" not in src
    assert "setAlwaysOnTop" not in src or "窗口置顶" in src
    assert "全部画板" in src
    assert "original_url" in src or "originalUrl" in src


def test_packaging_files_exist():
    assert (ROOT / "electron" / "main.js").is_file()
    assert (ROOT / "electron" / "preload.js").is_file()
    assert (ROOT / "electron" / "builder.yml").is_file()
    assert (ROOT / "backend" / "pyinstaller.spec").is_file()
    main = (ROOT / "electron" / "main.js").read_text(encoding="utf-8")
    assert "taskkill" in main
    assert "pickPort" in main or "POSEBOARD_PORT" in main
    installer = ROOT / "release" / "姿态图库 Setup 1.0.0.exe"
    unpacked = ROOT / "release" / "win-unpacked" / "姿态图库.exe"
    old_installer = ROOT / "release" / "PoseBoard Setup 1.0.0.exe"
    old_unpacked = ROOT / "release" / "win-unpacked" / "PoseBoard.exe"
    assert installer.is_file() or unpacked.is_file() or old_installer.is_file() or old_unpacked.is_file()
    frontend_dist = ROOT / "frontend" / "dist" / "index.html"
    assert frontend_dist.is_file()

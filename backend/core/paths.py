from __future__ import annotations

import os
from pathlib import Path


def get_data_root() -> Path:
    override = os.environ.get("POSEBOARD_DATA_DIR")
    if override:
        return Path(override).resolve()
    appdata = os.environ.get("APPDATA")
    if appdata:
        return Path(appdata) / "PoseBoard"
    return Path.home() / "AppData" / "Roaming" / "PoseBoard"


def originals_dir() -> Path:
    return get_data_root() / "originals"


def thumbnails_dir() -> Path:
    return get_data_root() / "thumbnails"


def backups_dir() -> Path:
    return get_data_root() / "backups"


def board_previews_dir() -> Path:
    return get_data_root() / "board_previews"


def db_path() -> Path:
    return get_data_root() / "poseboard.db"


def ensure_data_dirs() -> Path:
    root = get_data_root()
    originals_dir().mkdir(parents=True, exist_ok=True)
    thumbnails_dir().mkdir(parents=True, exist_ok=True)
    board_previews_dir().mkdir(parents=True, exist_ok=True)
    backups_dir().mkdir(parents=True, exist_ok=True)
    return root

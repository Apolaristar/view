from __future__ import annotations

import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable, Optional

from core.paths import db_path, ensure_data_dirs

SCHEMA = """
CREATE TABLE IF NOT EXISTS images (
  id INTEGER PRIMARY KEY,
  uid TEXT UNIQUE NOT NULL,
  original_path TEXT NOT NULL,
  thumbnail_path TEXT NOT NULL,
  file_hash TEXT UNIQUE NOT NULL,
  width INTEGER,
  height INTEGER,
  camera_angle TEXT DEFAULT 'unknown',
  pose_landmarks TEXT,
  pose_status TEXT NOT NULL DEFAULT 'pending',
  color_status TEXT NOT NULL DEFAULT 'pending',
  palette TEXT,
  primary_family TEXT,
  secondary_family TEXT,
  extra_families TEXT,
  color_manual INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tags (
  id INTEGER PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  color TEXT,
  parent_id INTEGER,
  kind TEXT NOT NULL DEFAULT 'custom',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS image_tags (
  image_id INTEGER NOT NULL,
  tag_id INTEGER NOT NULL,
  PRIMARY KEY (image_id, tag_id)
);

CREATE TABLE IF NOT EXISTS boards (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  pan_x REAL NOT NULL DEFAULT 0,
  pan_y REAL NOT NULL DEFAULT 0,
  zoom REAL NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS board_items (
  id INTEGER PRIMARY KEY,
  board_id INTEGER NOT NULL,
  image_id INTEGER NOT NULL,
  x REAL NOT NULL,
  y REAL NOT NULL,
  width REAL NOT NULL,
  height REAL NOT NULL,
  z_index INTEGER NOT NULL DEFAULT 0,
  rotation REAL NOT NULL DEFAULT 0,
  crop_x REAL NOT NULL DEFAULT 0,
  crop_y REAL NOT NULL DEFAULT 0,
  crop_w REAL NOT NULL DEFAULT 1,
  crop_h REAL NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS board_tray (
  id INTEGER PRIMARY KEY,
  board_id INTEGER NOT NULL,
  image_id INTEGER NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  UNIQUE(board_id, image_id)
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS backups (
  id INTEGER PRIMARY KEY,
  created_at TEXT NOT NULL,
  note TEXT,
  path TEXT NOT NULL,
  size_bytes INTEGER,
  status TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_images_hash ON images(file_hash);
CREATE INDEX IF NOT EXISTS idx_images_family ON images(primary_family);
CREATE INDEX IF NOT EXISTS idx_images_angle ON images(camera_angle);
CREATE INDEX IF NOT EXISTS idx_images_pose ON images(pose_status);
CREATE INDEX IF NOT EXISTS idx_board_items_board ON board_items(board_id);
CREATE INDEX IF NOT EXISTS idx_board_items_image ON board_items(image_id);
CREATE INDEX IF NOT EXISTS idx_board_tray_board ON board_tray(board_id);
"""

DEFAULT_SETTINGS = {
    "last_opened_board_id": "",
    "last_backup_at": "",
    "backup_remind_days": "7",
    "color_mode": "full",
}


def utcnow() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def connect() -> sqlite3.Connection:
    ensure_data_dirs()
    conn = sqlite3.connect(str(db_path()), timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    return conn


def _table_columns(conn: sqlite3.Connection, table: str) -> set[str]:
    return {row[1] for row in conn.execute(f"PRAGMA table_info({table})")}


def migrate_schema(conn: sqlite3.Connection) -> None:
    cols = _table_columns(conn, "tags")
    if "parent_id" not in cols:
        conn.execute("ALTER TABLE tags ADD COLUMN parent_id INTEGER")
    if "kind" not in cols:
        conn.execute("ALTER TABLE tags ADD COLUMN kind TEXT NOT NULL DEFAULT 'custom'")
    if "sort_order" not in cols:
        conn.execute("ALTER TABLE tags ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0")
        grouped: dict[tuple, list[int]] = {}
        for row in conn.execute("SELECT id, kind, parent_id FROM tags ORDER BY kind, parent_id, name, id"):
            key = (row["kind"], row["parent_id"])
            grouped.setdefault(key, []).append(int(row["id"]))
        for ids in grouped.values():
            for index, tag_id in enumerate(ids):
                conn.execute("UPDATE tags SET sort_order = ? WHERE id = ?", (index, tag_id))
    item_cols = _table_columns(conn, "board_items")
    extras = {
        "rotation": "REAL NOT NULL DEFAULT 0",
        "crop_x": "REAL NOT NULL DEFAULT 0",
        "crop_y": "REAL NOT NULL DEFAULT 0",
        "crop_w": "REAL NOT NULL DEFAULT 1",
        "crop_h": "REAL NOT NULL DEFAULT 1",
    }
    for name, decl in extras.items():
        if name not in item_cols:
            conn.execute(f"ALTER TABLE board_items ADD COLUMN {name} {decl}")
    image_cols = _table_columns(conn, "images")
    if "secondary_family" not in image_cols:
        conn.execute("ALTER TABLE images ADD COLUMN secondary_family TEXT")
    if "extra_families" not in image_cols:
        conn.execute("ALTER TABLE images ADD COLUMN extra_families TEXT")
    if "color_manual" not in image_cols:
        conn.execute("ALTER TABLE images ADD COLUMN color_manual INTEGER NOT NULL DEFAULT 0")


DEFAULT_CATEGORIES = ("人物", "场景", "道具", "其他")
DEFAULT_FACETS = {
    "人物": ("正面", "侧面", "背面", "俯视", "其他视角"),
    "场景": ("室内", "室外", "自然", "城市"),
}


def seed_default_taxonomy(conn: sqlite3.Connection) -> None:
    now = utcnow()

    def upsert(name: str, kind: str, parent_id: Optional[int] = None) -> int:
        row = conn.execute("SELECT id FROM tags WHERE name = ?", (name,)).fetchone()
        if row:
            conn.execute(
                "UPDATE tags SET kind = ?, parent_id = COALESCE(?, parent_id) WHERE id = ?",
                (kind, parent_id, row["id"]),
            )
            return int(row["id"])
        if parent_id is None:
            max_row = conn.execute(
                "SELECT COALESCE(MAX(sort_order), -1) AS m FROM tags WHERE kind = ? AND parent_id IS NULL",
                (kind,),
            ).fetchone()
        else:
            max_row = conn.execute(
                "SELECT COALESCE(MAX(sort_order), -1) AS m FROM tags WHERE kind = ? AND parent_id = ?",
                (kind, parent_id),
            ).fetchone()
        sort_order = int(max_row["m"]) + 1
        cur = conn.execute(
            "INSERT INTO tags(name, color, parent_id, kind, sort_order, created_at) VALUES (?, NULL, ?, ?, ?, ?)",
            (name, parent_id, kind, sort_order, now),
        )
        return int(cur.lastrowid)

    ids = {name: upsert(name, "category") for name in DEFAULT_CATEGORIES}
    for parent_name, children in DEFAULT_FACETS.items():
        parent_id = ids[parent_name]
        for child in children:
            upsert(child, "facet", parent_id)


def init_db() -> None:
    conn = connect()
    try:
        conn.executescript(SCHEMA)
        migrate_schema(conn)
        seed_default_taxonomy(conn)
        for key, value in DEFAULT_SETTINGS.items():
            conn.execute(
                "INSERT OR IGNORE INTO settings(key, value) VALUES (?, ?)",
                (key, value),
            )
        conn.commit()
    finally:
        conn.close()


def row_to_dict(row: sqlite3.Row | None) -> Optional[dict[str, Any]]:
    if row is None:
        return None
    return {k: row[k] for k in row.keys()}


def rows_to_dicts(rows: Iterable[sqlite3.Row]) -> list[dict[str, Any]]:
    return [{k: row[k] for k in row.keys()} for row in rows]


def get_setting(conn: sqlite3.Connection, key: str, default: str = "") -> str:
    row = conn.execute("SELECT value FROM settings WHERE key = ?", (key,)).fetchone()
    if row is None:
        return default
    return row["value"]


def set_setting(conn: sqlite3.Connection, key: str, value: str) -> None:
    conn.execute(
        "INSERT INTO settings(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        (key, value),
    )


def checkpoint(conn: sqlite3.Connection) -> None:
    conn.execute("PRAGMA wal_checkpoint(TRUNCATE)")

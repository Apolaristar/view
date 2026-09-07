from __future__ import annotations

import sqlite3
import shutil
import tempfile
import zipfile
from datetime import datetime, timezone
from pathlib import Path

from core.database import checkpoint, connect, utcnow
from core.paths import backups_dir, originals_dir, thumbnails_dir, board_previews_dir, get_data_root, ensure_data_dirs


def _zip_dir(zf: zipfile.ZipFile, src: Path, arc_prefix: str) -> None:
    if not src.exists():
        return
    for path in src.rglob("*"):
        if path.is_file():
            zf.write(path, arcname=f"{arc_prefix}/{path.relative_to(src).as_posix()}")


def snapshot_db(dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists():
        dest.unlink()
    src = connect()
    try:
        checkpoint(src)
        dst = sqlite3.connect(str(dest))
        try:
            src.backup(dst)
            dst.commit()
        finally:
            dst.close()
    finally:
        src.close()


def create_backup(note: str | None = None) -> dict:
    ensure_data_dirs()
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%f")
    filename = f"backup_{stamp}.zip"
    final_path = backups_dir() / filename
    tmp_path = backups_dir() / f".tmp_{filename}"
    snap = backups_dir() / f".snap_{stamp}.db"
    try:
        snapshot_db(snap)
        with zipfile.ZipFile(tmp_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
            zf.write(snap, arcname="poseboard.db")
            _zip_dir(zf, originals_dir(), "originals")
            _zip_dir(zf, thumbnails_dir(), "thumbnails")
            _zip_dir(zf, board_previews_dir(), "board_previews")
        tmp_path.replace(final_path)
        size = final_path.stat().st_size
        created_at = utcnow()
        conn = connect()
        try:
            cur = conn.execute(
                """
                INSERT INTO backups(created_at, note, path, size_bytes, status)
                VALUES (?, ?, ?, ?, 'success')
                """,
                (created_at, note or "", final_path.name, size),
            )
            conn.execute(
                "INSERT INTO settings(key, value) VALUES ('last_backup_at', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                (created_at,),
            )
            conn.commit()
            backup_id = cur.lastrowid
        finally:
            conn.close()
        return {
            "id": backup_id,
            "created_at": created_at,
            "note": note or "",
            "path": final_path.name,
            "size_bytes": size,
            "status": "success",
        }
    except Exception as exc:
        if tmp_path.exists():
            tmp_path.unlink()
        raise RuntimeError(str(exc)) from exc
    finally:
        if snap.exists():
            snap.unlink()


def list_backups() -> list[dict]:
    conn = connect()
    try:
        rows = conn.execute(
            "SELECT * FROM backups WHERE status = 'success' ORDER BY id DESC"
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def _validate_backup_zip(path: Path) -> None:
    with zipfile.ZipFile(path, "r") as zf:
        names = zf.namelist()
        if "poseboard.db" not in names:
            raise RuntimeError("备份包缺少 poseboard.db")


def restore_backup(backup_id: int) -> dict:
    conn = connect()
    try:
        row = conn.execute("SELECT * FROM backups WHERE id = ?", (backup_id,)).fetchone()
        if row is None or row["status"] != "success":
            raise RuntimeError("备份不存在")
        zip_path = backups_dir() / row["path"]
        if not zip_path.exists():
            raise RuntimeError("备份文件缺失")
        _validate_backup_zip(zip_path)
    finally:
        conn.close()

    safety = create_backup(note="恢复前自动备份")
    root = get_data_root()
    with tempfile.TemporaryDirectory() as tmp:
        tmpdir = Path(tmp)
        with zipfile.ZipFile(zip_path, "r") as zf:
            zf.extractall(tmpdir)
        extracted_db = tmpdir / "poseboard.db"
        if not extracted_db.exists():
            raise RuntimeError("备份包损坏：无数据库")

        dest_orig = originals_dir()
        dest_thumbs = thumbnails_dir()
        dest_previews = board_previews_dir()
        staging_orig = root / ".restore_originals"
        staging_thumbs = root / ".restore_thumbnails"
        staging_previews = root / ".restore_board_previews"
        if staging_orig.exists():
            shutil.rmtree(staging_orig)
        if staging_thumbs.exists():
            shutil.rmtree(staging_thumbs)
        if staging_previews.exists():
            shutil.rmtree(staging_previews)
        originals_tmp = tmpdir / "originals"
        thumbs_tmp = tmpdir / "thumbnails"
        previews_tmp = tmpdir / "board_previews"
        if originals_tmp.exists():
            shutil.copytree(originals_tmp, staging_orig)
        else:
            staging_orig.mkdir()
        if thumbs_tmp.exists():
            shutil.copytree(thumbs_tmp, staging_thumbs)
        else:
            staging_thumbs.mkdir()
        if previews_tmp.exists():
            shutil.copytree(previews_tmp, staging_previews)
        else:
            staging_previews.mkdir()

        src = sqlite3.connect(str(extracted_db))
        live = connect()
        try:
            checkpoint(live)
            src.backup(live)
            live.commit()
        finally:
            src.close()
            live.close()

        try:
            if dest_orig.exists():
                shutil.rmtree(dest_orig)
            shutil.move(str(staging_orig), str(dest_orig))
            if dest_thumbs.exists():
                shutil.rmtree(dest_thumbs)
            shutil.move(str(staging_thumbs), str(dest_thumbs))
            if dest_previews.exists():
                shutil.rmtree(dest_previews)
            shutil.move(str(staging_previews), str(dest_previews))
        except Exception:
            raise

    conn = connect()
    try:
        exists = conn.execute(
            "SELECT id FROM backups WHERE path = ?",
            (safety["path"],),
        ).fetchone()
        if exists is None:
            conn.execute(
                """
                INSERT INTO backups(created_at, note, path, size_bytes, status)
                VALUES (?, ?, ?, ?, 'success')
                """,
                (safety["created_at"], safety["note"], safety["path"], safety["size_bytes"]),
            )
            conn.commit()
            safety_id = conn.execute("SELECT last_insert_rowid() AS id").fetchone()["id"]
        else:
            safety_id = exists["id"]
    finally:
        conn.close()

    return {"restored_id": backup_id, "safety_backup_id": safety_id}

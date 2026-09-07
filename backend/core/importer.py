from __future__ import annotations

import json
import shutil
import uuid
from pathlib import Path

from core.database import connect, utcnow
from core.images_io import collect_image_paths, make_thumbnail, sha256_file
from core.paths import originals_dir, thumbnails_dir
from core.queue import enqueue_image


def _copy_original(src: Path, uid: str) -> Path:
    ext = src.suffix.lower() or ".jpg"
    dest = originals_dir() / f"{uid}{ext}"
    shutil.copy2(src, dest)
    return dest


def import_paths(paths: list[str]) -> dict:
    collected = collect_image_paths(paths)
    imported: list[dict] = []
    skipped: list[dict] = []
    failed: list[dict] = []

    conn = connect()
    try:
        for src in collected:
            try:
                file_hash = sha256_file(src)
                existing = conn.execute(
                    "SELECT id, uid FROM images WHERE file_hash = ?",
                    (file_hash,),
                ).fetchone()
                if existing:
                    skipped.append(
                        {
                            "path": str(src),
                            "image_id": existing["id"],
                            "reason": "already_exists",
                        }
                    )
                    continue

                uid = str(uuid.uuid4())
                original = _copy_original(src, uid)
                thumb = thumbnails_dir() / f"{uid}.webp"
                width, height = make_thumbnail(src, thumb)
                created_at = utcnow()
                cur = conn.execute(
                    """
                    INSERT INTO images (
                      uid, original_path, thumbnail_path, file_hash,
                      width, height, camera_angle, pose_status, color_status, created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, 'unknown', 'pending', 'pending', ?)
                    """,
                    (
                        uid,
                        original.name,
                        thumb.name,
                        file_hash,
                        width,
                        height,
                        created_at,
                    ),
                )
                image_id = cur.lastrowid
                conn.commit()
                enqueue_image(image_id)
                imported.append({"id": image_id, "uid": uid, "path": str(src)})
            except Exception as exc:  # noqa: BLE001 — per-file isolation
                conn.rollback()
                failed.append({"path": str(src), "reason": str(exc)})
    finally:
        conn.close()

    return {
        "imported": imported,
        "skipped": skipped,
        "failed": failed,
        "imported_count": len(imported),
        "skipped_count": len(skipped),
        "failed_count": len(failed),
    }

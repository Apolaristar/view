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


def import_paths(paths: list[str], in_library: bool = True, tag_ids: list[int] | None = None) -> dict:
    collected = collect_image_paths(paths)
    imported: list[dict] = []
    skipped: list[dict] = []
    failed: list[dict] = []
    apply_ids: list[int] = []
    wanted_tags = [int(tid) for tid in (tag_ids or []) if tid]

    conn = connect()
    try:
        for src in collected:
            try:
                file_hash = sha256_file(src)
                dest_flag = 1 if in_library else 0
                dest_prefix = f"{file_hash}:{'lib' if in_library else 'board'}:"
                existing = conn.execute(
                    """
                    SELECT id, uid FROM images
                    WHERE (file_hash = ? AND COALESCE(in_library, 1) = ?)
                       OR file_hash LIKE ?
                    """,
                    (file_hash, dest_flag, dest_prefix + "%"),
                ).fetchone()
                if existing:
                    skipped.append(
                        {
                            "path": str(src),
                            "image_id": existing["id"],
                            "reason": "already_exists",
                        }
                    )
                    if in_library and wanted_tags:
                        apply_ids.append(int(existing["id"]))
                    continue
                hash_taken = conn.execute(
                    "SELECT 1 FROM images WHERE file_hash = ?",
                    (file_hash,),
                ).fetchone()
                if hash_taken:
                    file_hash = f"{dest_prefix}{uuid.uuid4()}"

                uid = str(uuid.uuid4())
                original = _copy_original(src, uid)
                thumb = thumbnails_dir() / f"{uid}.webp"
                width, height = make_thumbnail(src, thumb)
                created_at = utcnow()
                pose_status = "pending" if in_library else "none"
                color_status = "pending" if in_library else "ok"
                cur = conn.execute(
                    """
                    INSERT INTO images (
                      uid, original_path, thumbnail_path, file_hash,
                      width, height, camera_angle, pose_status, color_status, in_library, created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, 'unknown', ?, ?, ?, ?)
                    """,
                    (
                        uid,
                        original.name,
                        thumb.name,
                        file_hash,
                        width,
                        height,
                        pose_status,
                        color_status,
                        1 if in_library else 0,
                        created_at,
                    ),
                )
                image_id = cur.lastrowid
                conn.commit()
                if in_library:
                    enqueue_image(image_id)
                imported.append({"id": image_id, "uid": uid, "path": str(src)})
                if in_library and wanted_tags:
                    apply_ids.append(int(image_id))
            except Exception as exc:  # noqa: BLE001 — per-file isolation
                conn.rollback()
                failed.append({"path": str(src), "reason": str(exc)})
    finally:
        conn.close()

    if apply_ids and wanted_tags:
        from core.images import batch_tags

        batch_tags(list(dict.fromkeys(apply_ids)), wanted_tags, [])

    return {
        "imported": imported,
        "skipped": skipped,
        "failed": failed,
        "imported_count": len(imported),
        "skipped_count": len(skipped),
        "failed_count": len(failed),
    }

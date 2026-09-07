from __future__ import annotations

from datetime import datetime, timezone

from core.boards import list_boards
from core.database import connect, get_setting
from core.images import list_images, serialize_image, tags_for_images
from core.queue import jobs_summary


def home_summary() -> dict:
    conn = connect()
    try:
        image_count = conn.execute("SELECT COUNT(*) AS c FROM images").fetchone()["c"]
        tag_count = conn.execute("SELECT COUNT(*) AS c FROM tags").fetchone()["c"]
        board_count = conn.execute("SELECT COUNT(*) AS c FROM boards").fetchone()["c"]
        failed_count = conn.execute(
            """
            SELECT COUNT(*) AS c FROM images
            WHERE pose_status = 'failed' OR color_status = 'failed'
            """
        ).fetchone()["c"]
        last_board_id = get_setting(conn, "last_opened_board_id", "")
        last_board = None
        if last_board_id:
            row = conn.execute("SELECT * FROM boards WHERE id = ?", (last_board_id,)).fetchone()
            if row:
                count = conn.execute(
                    "SELECT COUNT(*) AS c FROM board_items WHERE board_id = ?",
                    (row["id"],),
                ).fetchone()["c"]
                last_board = {
                    "id": row["id"],
                    "name": row["name"],
                    "item_count": count,
                    "updated_at": row["updated_at"],
                }
        recent_rows = conn.execute(
            "SELECT * FROM images ORDER BY created_at DESC, id DESC LIMIT 12"
        ).fetchall()
        ids = [r["id"] for r in recent_rows]
        tag_map = tags_for_images(conn, ids)
        recent_images = [serialize_image(dict(r), tag_map.get(r["id"], [])) for r in recent_rows]
        last_backup_at = get_setting(conn, "last_backup_at", "")
        remind_days = int(get_setting(conn, "backup_remind_days", "7") or "7")
        backup_overdue = True
        if last_backup_at:
            try:
                ts = datetime.fromisoformat(last_backup_at.replace("Z", "+00:00"))
                if ts.tzinfo is None:
                    ts = ts.replace(tzinfo=timezone.utc)
                delta = datetime.now(timezone.utc) - ts
                backup_overdue = delta.days >= remind_days
            except ValueError:
                backup_overdue = True
        elif image_count == 0:
            backup_overdue = False
    finally:
        conn.close()

    jobs = jobs_summary()
    recent_boards = list_boards()[:4]
    return {
        "last_board": last_board,
        "recent_images": recent_images,
        "recent_boards": recent_boards,
        "counts": {
            "images": image_count,
            "tags": tag_count,
            "boards": board_count,
            "pending_jobs": jobs["pending"],
        },
        "failed_count": failed_count,
        "last_backup_at": last_backup_at or None,
        "backup_overdue": backup_overdue,
    }

from __future__ import annotations

from typing import Optional

from core.database import connect, utcnow
from core.images import serialize_image, tags_for_images
from core.paths import board_previews_dir


def _row_dict(row) -> dict:
    return {k: row[k] for k in row.keys()}


def board_preview_path(board_id: int):
    return board_previews_dir() / f"{int(board_id)}.jpg"


def board_preview_url(board_id: int, updated_at: str = "") -> str | None:
    path = board_preview_path(board_id)
    if not path.is_file():
        return None
    query = f"?v={updated_at}" if updated_at else ""
    return f"/media/board-previews/{int(board_id)}{query}"


def delete_board_preview(board_id: int) -> None:
    path = board_preview_path(board_id)
    if path.is_file():
        path.unlink()


def save_board_preview(board_id: int, image: str) -> Optional[dict]:
    from io import BytesIO
    import base64

    from PIL import Image

    board = get_board(board_id)
    if board is None:
        return None
    raw = image.strip()
    if "," in raw and raw.lower().startswith("data:"):
        raw = raw.split(",", 1)[1]
    try:
        blob = base64.b64decode(raw)
        im = Image.open(BytesIO(blob)).convert("RGB")
    except Exception:
        return None
    im.thumbnail((720, 450))
    dest = board_preview_path(board_id)
    dest.parent.mkdir(parents=True, exist_ok=True)
    im.save(dest, "JPEG", quality=84)
    return get_board(board_id)


def _sync_tray_from_items(conn, board_id: int) -> None:
    ids = [
        row["image_id"]
        for row in conn.execute("SELECT DISTINCT image_id FROM board_items WHERE board_id = ?", (board_id,))
    ]
    if not ids:
        return
    existing = {
        row["image_id"]
        for row in conn.execute("SELECT image_id FROM board_tray WHERE board_id = ?", (board_id,))
    }
    max_row = conn.execute(
        "SELECT COALESCE(MAX(sort_order), -1) AS m FROM board_tray WHERE board_id = ?",
        (board_id,),
    ).fetchone()
    order = int(max_row["m"]) + 1
    now = utcnow()
    for image_id in ids:
        if image_id in existing:
            continue
        conn.execute(
            "INSERT INTO board_tray(board_id, image_id, sort_order, created_at) VALUES (?, ?, ?, ?)",
            (board_id, image_id, order, now),
        )
        order += 1


def _tray_images(conn, board_id: int) -> list[dict]:
    rows = conn.execute(
        """
        SELECT i.*
        FROM board_tray t
        JOIN images i ON i.id = t.image_id
        WHERE t.board_id = ?
        ORDER BY t.sort_order ASC, t.id ASC
        """,
        (board_id,),
    ).fetchall()
    image_ids = [row["id"] for row in rows]
    tag_map = tags_for_images(conn, image_ids)
    return [serialize_image(_row_dict(row), tag_map.get(row["id"], [])) for row in rows]


def list_boards() -> list[dict]:
    conn = connect()
    try:
        boards = conn.execute("SELECT * FROM boards ORDER BY updated_at DESC, id DESC").fetchall()
        out = []
        for b in boards:
            count = conn.execute(
                "SELECT COUNT(*) AS c FROM board_items WHERE board_id = ?",
                (b["id"],),
            ).fetchone()["c"]
            tray_count = conn.execute(
                "SELECT COUNT(*) AS c FROM board_tray WHERE board_id = ?",
                (b["id"],),
            ).fetchone()["c"]
            previews = conn.execute(
                """
                SELECT i.uid, i.thumbnail_path
                FROM board_items bi
                JOIN images i ON i.id = bi.image_id
                WHERE bi.board_id = ?
                ORDER BY bi.z_index DESC, bi.id DESC
                LIMIT 4
                """,
                (b["id"],),
            ).fetchall()
            if not previews:
                previews = conn.execute(
                    """
                    SELECT i.uid, i.thumbnail_path
                    FROM board_tray t
                    JOIN images i ON i.id = t.image_id
                    WHERE t.board_id = ?
                    ORDER BY t.sort_order DESC, t.id DESC
                    LIMIT 4
                    """,
                    (b["id"],),
                ).fetchall()
            out.append(
                {
                    "id": b["id"],
                    "name": b["name"],
                    "pan_x": b["pan_x"],
                    "pan_y": b["pan_y"],
                    "zoom": b["zoom"],
                    "updated_at": b["updated_at"],
                    "item_count": count,
                    "tray_count": tray_count,
                    "preview_url": board_preview_url(b["id"], b["updated_at"]),
                    "previews": [
                        {"uid": p["uid"], "thumbnail_url": f"/media/thumbnails/{p['uid']}"}
                        for p in previews
                    ],
                }
            )
        return out
    finally:
        conn.close()


def create_board(name: str) -> dict:
    conn = connect()
    try:
        now = utcnow()
        cur = conn.execute(
            "INSERT INTO boards(name, pan_x, pan_y, zoom, updated_at) VALUES (?, 0, 0, 1, ?)",
            (name.strip() or "未命名画板", now),
        )
        conn.commit()
        board_id = cur.lastrowid
    finally:
        conn.close()
    return get_board(board_id)


def get_board(board_id: int) -> Optional[dict]:
    conn = connect()
    try:
        b = conn.execute("SELECT * FROM boards WHERE id = ?", (board_id,)).fetchone()
        if b is None:
            return None
        _sync_tray_from_items(conn, board_id)
        conn.commit()
        items = conn.execute(
            """
            SELECT bi.*, i.uid, i.thumbnail_path, i.original_path, i.width AS image_width,
                   i.height AS image_height, i.file_hash, i.camera_angle, i.pose_status,
                   i.color_status, i.palette, i.primary_family, i.secondary_family, i.extra_families,
                   i.notes, i.created_at, i.pose_landmarks
            FROM board_items bi
            JOIN images i ON i.id = bi.image_id
            WHERE bi.board_id = ?
            ORDER BY bi.z_index ASC, bi.id ASC
            """,
            (board_id,),
        ).fetchall()
        image_ids = [row["image_id"] for row in items]
        tag_map = tags_for_images(conn, image_ids)
        serialized_items = []
        for row in items:
            image = serialize_image(
                {
                    "id": row["image_id"],
                    "uid": row["uid"],
                    "original_path": row["original_path"],
                    "thumbnail_path": row["thumbnail_path"],
                    "file_hash": row["file_hash"],
                    "width": row["image_width"],
                    "height": row["image_height"],
                    "camera_angle": row["camera_angle"],
                    "pose_landmarks": row["pose_landmarks"],
                    "pose_status": row["pose_status"],
                    "color_status": row["color_status"],
                    "palette": row["palette"],
                    "primary_family": row["primary_family"],
                    "secondary_family": row["secondary_family"] if "secondary_family" in row.keys() else None,
                    "extra_families": row["extra_families"] if "extra_families" in row.keys() else None,
                    "notes": row["notes"],
                    "created_at": row["created_at"],
                },
                tag_map.get(row["image_id"], []),
            )
            keys = row.keys()
            serialized_items.append(
                {
                    "id": row["id"],
                    "board_id": row["board_id"],
                    "image_id": row["image_id"],
                    "x": row["x"],
                    "y": row["y"],
                    "width": row["width"],
                    "height": row["height"],
                    "z_index": row["z_index"],
                    "rotation": row["rotation"] if "rotation" in keys else 0,
                    "crop_x": row["crop_x"] if "crop_x" in keys else 0,
                    "crop_y": row["crop_y"] if "crop_y" in keys else 0,
                    "crop_w": row["crop_w"] if "crop_w" in keys else 1,
                    "crop_h": row["crop_h"] if "crop_h" in keys else 1,
                    "flipped": bool(row["flipped"]) if "flipped" in keys else False,
                    "grayscale": bool(row["grayscale"]) if "grayscale" in keys else False,
                    "locked": bool(row["locked"]) if "locked" in keys else False,
                    "group_id": row["group_id"] if "group_id" in keys else None,
                    "image": image,
                }
            )
        return {
            "id": b["id"],
            "name": b["name"],
            "pan_x": b["pan_x"],
            "pan_y": b["pan_y"],
            "zoom": b["zoom"],
            "grayscale": bool(b["grayscale"]) if "grayscale" in b.keys() else False,
            "updated_at": b["updated_at"],
            "items": serialized_items,
            "tray": _tray_images(conn, board_id),
            "item_count": len(serialized_items),
            "preview_url": board_preview_url(b["id"], b["updated_at"]),
        }
    finally:
        conn.close()


def patch_board(board_id: int, **fields) -> Optional[dict]:
    conn = connect()
    try:
        row = conn.execute("SELECT * FROM boards WHERE id = ?", (board_id,)).fetchone()
        if row is None:
            return None
        mapping = {"name": "name", "pan_x": "pan_x", "pan_y": "pan_y", "zoom": "zoom"}
        for key, col in mapping.items():
            if key in fields and fields[key] is not None:
                conn.execute(f"UPDATE boards SET {col} = ? WHERE id = ?", (fields[key], board_id))
        conn.execute("UPDATE boards SET updated_at = ? WHERE id = ?", (utcnow(), board_id))
        conn.commit()
    finally:
        conn.close()
    return get_board(board_id)


def delete_board(board_id: int) -> bool:
    conn = connect()
    try:
        row = conn.execute("SELECT id FROM boards WHERE id = ?", (board_id,)).fetchone()
        if row is None:
            return False
        conn.execute("DELETE FROM board_tray WHERE board_id = ?", (board_id,))
        conn.execute("DELETE FROM board_items WHERE board_id = ?", (board_id,))
        conn.execute("DELETE FROM boards WHERE id = ?", (board_id,))
        last = conn.execute(
            "SELECT value FROM settings WHERE key = 'last_opened_board_id'"
        ).fetchone()
        if last and last["value"] == str(board_id):
            conn.execute(
                "UPDATE settings SET value = '' WHERE key = 'last_opened_board_id'"
            )
        conn.commit()
        delete_board_preview(board_id)
        return True
    finally:
        conn.close()


def save_layout(
    board_id: int,
    pan_x: float,
    pan_y: float,
    zoom: float,
    items: list[dict],
    grayscale: bool | None = None,
) -> Optional[dict]:
    conn = connect()
    try:
        row = conn.execute("SELECT id FROM boards WHERE id = ?", (board_id,)).fetchone()
        if row is None:
            return None
        if grayscale is None:
            conn.execute(
                "UPDATE boards SET pan_x = ?, pan_y = ?, zoom = ?, updated_at = ? WHERE id = ?",
                (pan_x, pan_y, zoom, utcnow(), board_id),
            )
        else:
            conn.execute(
                "UPDATE boards SET pan_x = ?, pan_y = ?, zoom = ?, grayscale = ?, updated_at = ? WHERE id = ?",
                (pan_x, pan_y, zoom, 1 if grayscale else 0, utcnow(), board_id),
            )
        conn.execute("DELETE FROM board_items WHERE board_id = ?", (board_id,))
        for item in items:
            image_id = item["image_id"] if isinstance(item, dict) else item.image_id
            exists = conn.execute("SELECT id FROM images WHERE id = ?", (image_id,)).fetchone()
            if not exists:
                continue
            def field(name, default):
                if isinstance(item, dict):
                    return item.get(name, default)
                return getattr(item, name, default)

            conn.execute(
                """
                INSERT INTO board_items(
                  board_id, image_id, x, y, width, height, z_index,
                  rotation, crop_x, crop_y, crop_w, crop_h, flipped, grayscale, locked, group_id
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    board_id,
                    image_id,
                    field("x", 0),
                    field("y", 0),
                    field("width", 240),
                    field("height", 240),
                    field("z_index", 0),
                    field("rotation", 0) or 0,
                    field("crop_x", 0) or 0,
                    field("crop_y", 0) or 0,
                    field("crop_w", 1) if field("crop_w", 1) else 1,
                    field("crop_h", 1) if field("crop_h", 1) else 1,
                    1 if field("flipped", False) else 0,
                    1 if field("grayscale", False) else 0,
                    1 if field("locked", False) else 0,
                    field("group_id", None) or None,
                ),
            )
        _sync_tray_from_items(conn, board_id)
        conn.commit()
    finally:
        conn.close()
    if not items:
        delete_board_preview(board_id)
    return get_board(board_id)


def add_item(board_id: int, image_id: int, x: float, y: float, width: float, height: float) -> Optional[dict]:
    conn = connect()
    try:
        board = conn.execute("SELECT id FROM boards WHERE id = ?", (board_id,)).fetchone()
        image = conn.execute("SELECT id, width, height FROM images WHERE id = ?", (image_id,)).fetchone()
        if board is None or image is None:
            return None
        z = conn.execute(
            "SELECT COALESCE(MAX(z_index), 0) + 1 AS z FROM board_items WHERE board_id = ?",
            (board_id,),
        ).fetchone()["z"]
        if image["width"] and image["height"]:
            ratio = image["height"] / image["width"]
            height = width * ratio
        cur = conn.execute(
            """
            INSERT INTO board_items(
              board_id, image_id, x, y, width, height, z_index,
              rotation, crop_x, crop_y, crop_w, crop_h, flipped, grayscale
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 1, 1, 0, 0)
            """,
            (board_id, image_id, x, y, width, height, z),
        )
        item_id = cur.lastrowid
        _sync_tray_from_items(conn, board_id)
        conn.execute("UPDATE boards SET updated_at = ? WHERE id = ?", (utcnow(), board_id))
        conn.commit()
    finally:
        conn.close()
    board = get_board(board_id)
    if board is None:
        return None
    for item in board["items"]:
        if item["id"] == item_id:
            return item
    return board


def delete_item(item_id: int) -> bool:
    conn = connect()
    try:
        row = conn.execute("SELECT id, board_id FROM board_items WHERE id = ?", (item_id,)).fetchone()
        if row is None:
            return False
        conn.execute("DELETE FROM board_items WHERE id = ?", (item_id,))
        conn.execute("UPDATE boards SET updated_at = ? WHERE id = ?", (utcnow(), row["board_id"]))
        conn.commit()
        return True
    finally:
        conn.close()


def add_tray_images(board_id: int, image_ids: list[int]) -> Optional[dict]:
    conn = connect()
    try:
        board = conn.execute("SELECT id FROM boards WHERE id = ?", (board_id,)).fetchone()
        if board is None:
            return None
        max_row = conn.execute(
            "SELECT COALESCE(MAX(sort_order), -1) AS m FROM board_tray WHERE board_id = ?",
            (board_id,),
        ).fetchone()
        order = int(max_row["m"]) + 1
        for image_id in image_ids:
            image = conn.execute("SELECT id FROM images WHERE id = ?", (image_id,)).fetchone()
            if image is None:
                continue
            exists = conn.execute(
                "SELECT id FROM board_tray WHERE board_id = ? AND image_id = ?",
                (board_id, image_id),
            ).fetchone()
            if exists:
                continue
            conn.execute(
                "INSERT INTO board_tray(board_id, image_id, sort_order, created_at) VALUES (?, ?, ?, ?)",
                (board_id, image_id, order, utcnow()),
            )
            order += 1
        conn.execute("UPDATE boards SET updated_at = ? WHERE id = ?", (utcnow(), board_id))
        conn.commit()
    finally:
        conn.close()
    return get_board(board_id)


def remove_tray_image(board_id: int, image_id: int) -> Optional[dict]:
    conn = connect()
    try:
        board = conn.execute("SELECT id FROM boards WHERE id = ?", (board_id,)).fetchone()
        if board is None:
            return None
        conn.execute("DELETE FROM board_tray WHERE board_id = ? AND image_id = ?", (board_id, image_id))
        conn.execute("DELETE FROM board_items WHERE board_id = ? AND image_id = ?", (board_id, image_id))
        conn.execute("UPDATE boards SET updated_at = ? WHERE id = ?", (utcnow(), board_id))
        conn.commit()
    finally:
        conn.close()
    return get_board(board_id)

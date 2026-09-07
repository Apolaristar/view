from __future__ import annotations

import json
from typing import Optional

from core.color_extractor import matches_family_filter, matches_secondary_filter, parse_family_list, resolve_secondary_family
from core.database import connect, rows_to_dicts, utcnow
from core.paths import originals_dir, thumbnails_dir


def parse_json_list(raw) -> list:
    if not raw:
        return []
    if isinstance(raw, list):
        return raw
    try:
        data = json.loads(raw)
        return data if isinstance(data, list) else []
    except json.JSONDecodeError:
        return []


def serialize_image(row: dict, tags: Optional[list] = None) -> dict:
    uid = row["uid"]
    return {
        "id": row["id"],
        "uid": uid,
        "original_path": row["original_path"],
        "thumbnail_path": row["thumbnail_path"],
        "file_hash": row["file_hash"],
        "width": row["width"],
        "height": row["height"],
        "camera_angle": row["camera_angle"],
        "pose_landmarks": parse_json_list(row.get("pose_landmarks")),
        "pose_status": row["pose_status"],
        "color_status": row["color_status"],
        "palette": parse_json_list(row.get("palette")),
        "primary_family": row.get("primary_family"),
        "secondary_family": resolve_secondary_family(row),
        "extra_families": parse_family_list(row.get("extra_families")),
        "notes": row.get("notes") or "",
        "created_at": row["created_at"],
        "thumbnail_url": f"/media/thumbnails/{uid}",
        "original_url": f"/media/originals/{uid}",
        "local_path": str(originals_dir() / row["original_path"]),
        "tags": tags if tags is not None else [],
    }


def tags_for_images(conn, image_ids: list[int]) -> dict[int, list[dict]]:
    if not image_ids:
        return {}
    placeholders = ",".join("?" * len(image_ids))
    rows = conn.execute(
        f"""
        SELECT it.image_id, t.id, t.name, t.color, t.parent_id, t.kind
        FROM image_tags it
        JOIN tags t ON t.id = it.tag_id
        WHERE it.image_id IN ({placeholders})
        ORDER BY CASE t.kind WHEN 'category' THEN 0 WHEN 'facet' THEN 1 ELSE 2 END, t.sort_order, t.id
        """,
        image_ids,
    ).fetchall()
    out: dict[int, list[dict]] = {i: [] for i in image_ids}
    for row in rows:
        out[row["image_id"]].append(
            {
                "id": row["id"],
                "name": row["name"],
                "color": row["color"],
                "parent_id": row["parent_id"],
                "kind": row["kind"] or "custom",
            }
        )
    return out


def expand_tag_ids(conn, tag_ids: list[int]) -> list[int]:
    expanded = set(tag_ids)
    pending = list(tag_ids)
    while pending:
        tid = pending.pop()
        children = conn.execute("SELECT id FROM tags WHERE parent_id = ?", (tid,)).fetchall()
        for child in children:
            cid = int(child["id"])
            if cid not in expanded:
                expanded.add(cid)
                pending.append(cid)
    return list(expanded)


def list_images(
    tag_ids: list[int] | None = None,
    families: list[str] | None = None,
    angle: str | None = None,
    pose_status: str | None = None,
    q: str | None = None,
    failed: bool = False,
    secondary: list[str] | None = None,
    limit: int = 60,
    offset: int = 0,
) -> dict:
    conn = connect()
    try:
        sql = "SELECT * FROM images WHERE 1=1"
        params: list = []
        if angle:
            sql += " AND camera_angle = ?"
            params.append(angle)
        if pose_status:
            sql += " AND pose_status = ?"
            params.append(pose_status)
        if failed:
            sql += " AND (pose_status = 'failed' OR color_status = 'failed')"
        if q:
            sql += " AND (notes LIKE ? OR uid LIKE ?)"
            params.extend([f"%{q}%", f"%{q}%"])
        if tag_ids:
            for tid in tag_ids:
                expanded = expand_tag_ids(conn, [tid])
                placeholders = ",".join("?" * len(expanded))
                sql += f"""
                  AND id IN (
                    SELECT image_id FROM image_tags
                    WHERE tag_id IN ({placeholders})
                  )
                """
                params.extend(expanded)
        sql += " ORDER BY created_at DESC, id DESC"
        rows = [dict(r) for r in conn.execute(sql, params).fetchall()]
        if families:
            wanted = set(families)
            rows = [r for r in rows if matches_family_filter(r, wanted)]
        if secondary:
            wanted_sec = set(secondary)
            rows = [r for r in rows if matches_secondary_filter(r, wanted_sec)]
        total = len(rows)
        page = rows[offset : offset + limit]
        ids = [r["id"] for r in page]
        tag_map = tags_for_images(conn, ids)
        items = [serialize_image(r, tag_map.get(r["id"], [])) for r in page]
        return {"items": items, "total": total, "limit": limit, "offset": offset}
    finally:
        conn.close()


def get_image(image_id: int) -> Optional[dict]:
    conn = connect()
    try:
        row = conn.execute("SELECT * FROM images WHERE id = ?", (image_id,)).fetchone()
        if row is None:
            return None
        tags = tags_for_images(conn, [image_id]).get(image_id, [])
        return serialize_image(dict(row), tags)
    finally:
        conn.close()


def delete_image(image_id: int) -> Optional[dict]:
    conn = connect()
    try:
        row = conn.execute("SELECT * FROM images WHERE id = ?", (image_id,)).fetchone()
        if row is None:
            return None
        refs = conn.execute(
            "SELECT COUNT(*) AS c FROM board_items WHERE image_id = ?",
            (image_id,),
        ).fetchone()["c"]
        conn.execute("DELETE FROM image_tags WHERE image_id = ?", (image_id,))
        conn.execute("DELETE FROM board_items WHERE image_id = ?", (image_id,))
        conn.execute("DELETE FROM board_tray WHERE image_id = ?", (image_id,))
        conn.execute("DELETE FROM images WHERE id = ?", (image_id,))
        conn.commit()
        for folder, name in (
            (originals_dir(), row["original_path"]),
            (thumbnails_dir(), row["thumbnail_path"]),
        ):
            path = folder / name
            if path.exists():
                path.unlink()
        return {"deleted_id": image_id, "removed_board_items": refs}
    finally:
        conn.close()


def board_refs(image_id: int) -> dict:
    conn = connect()
    try:
        rows = conn.execute(
            """
            SELECT DISTINCT b.id, b.name
            FROM boards b
            WHERE b.id IN (
              SELECT board_id FROM board_items WHERE image_id = ?
              UNION
              SELECT board_id FROM board_tray WHERE image_id = ?
            )
            """,
            (image_id, image_id),
        ).fetchall()
        return {"count": len(rows), "boards": [dict(r) for r in rows]}
    finally:
        conn.close()


def patch_image(
    image_id: int,
    camera_angle=None,
    notes=None,
    primary_family=None,
    secondary_family=None,
    extra_families=None,
) -> Optional[dict]:
    conn = connect()
    try:
        row = conn.execute("SELECT * FROM images WHERE id = ?", (image_id,)).fetchone()
        if row is None:
            return None
        if camera_angle is not None:
            conn.execute("UPDATE images SET camera_angle = ? WHERE id = ?", (camera_angle, image_id))
        if notes is not None:
            conn.execute("UPDATE images SET notes = ? WHERE id = ?", (notes, image_id))
        if primary_family is not None:
            conn.execute("UPDATE images SET primary_family = ? WHERE id = ?", (primary_family or None, image_id))
        if secondary_family is not None:
            conn.execute("UPDATE images SET secondary_family = ? WHERE id = ?", (secondary_family, image_id))
        if extra_families is not None:
            cleaned = [str(x) for x in extra_families if x]
            conn.execute(
                "UPDATE images SET extra_families = ? WHERE id = ?",
                (json.dumps(cleaned, ensure_ascii=False), image_id),
            )
        if primary_family is not None or secondary_family is not None or extra_families is not None:
            conn.execute("UPDATE images SET color_manual = 1 WHERE id = ?", (image_id,))
        conn.commit()
    finally:
        conn.close()
    return get_image(image_id)


def save_palette(image_id: int, palette: list) -> Optional[dict]:
    conn = connect()
    try:
        row = conn.execute("SELECT id FROM images WHERE id = ?", (image_id,)).fetchone()
        if row is None:
            return None
        conn.execute(
            "UPDATE images SET palette = ?, color_status = 'ok' WHERE id = ?",
            (json.dumps(palette, ensure_ascii=False), image_id),
        )
        conn.commit()
    finally:
        conn.close()
    return get_image(image_id)


def list_tags() -> list[dict]:
    conn = connect()
    try:
        rows = conn.execute(
            """
            SELECT t.id, t.name, t.color, t.parent_id, t.kind, t.sort_order, t.created_at,
                   (SELECT COUNT(*) FROM image_tags it WHERE it.tag_id = t.id) AS image_count
            FROM tags t
            ORDER BY CASE t.kind WHEN 'category' THEN 0 WHEN 'facet' THEN 1 ELSE 2 END,
                     t.parent_id,
                     t.sort_order,
                     t.id
            """
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def _next_sort_order(conn, kind: str, parent_id: int | None) -> int:
    if parent_id is None:
        row = conn.execute(
            "SELECT COALESCE(MAX(sort_order), -1) AS m FROM tags WHERE kind = ? AND parent_id IS NULL",
            (kind,),
        ).fetchone()
    else:
        row = conn.execute(
            "SELECT COALESCE(MAX(sort_order), -1) AS m FROM tags WHERE kind = ? AND parent_id = ?",
            (kind, parent_id),
        ).fetchone()
    return int(row["m"]) + 1


def create_tag(
    name: str,
    color: str | None = None,
    parent_id: int | None = None,
    kind: str | None = None,
) -> dict:
    resolved_kind = kind or ("facet" if parent_id else "custom")
    if resolved_kind not in {"category", "facet", "custom"}:
        resolved_kind = "custom"
    conn = connect()
    try:
        if parent_id is not None:
            parent = conn.execute("SELECT id FROM tags WHERE id = ?", (parent_id,)).fetchone()
            if parent is None:
                raise ValueError("父级标签不存在")
        sort_order = _next_sort_order(conn, resolved_kind, parent_id)
        cur = conn.execute(
            "INSERT INTO tags(name, color, parent_id, kind, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?)",
            (name.strip(), color, parent_id, resolved_kind, sort_order, utcnow()),
        )
        conn.commit()
        return {
            "id": cur.lastrowid,
            "name": name.strip(),
            "color": color,
            "parent_id": parent_id,
            "kind": resolved_kind,
            "sort_order": sort_order,
            "image_count": 0,
        }
    finally:
        conn.close()


def patch_tag(
    tag_id: int,
    name: str | None = None,
    color: str | None = None,
    parent_id=None,
    kind: str | None = None,
) -> Optional[dict]:
    conn = connect()
    try:
        row = conn.execute("SELECT * FROM tags WHERE id = ?", (tag_id,)).fetchone()
        if row is None:
            return None
        if name is not None:
            conn.execute("UPDATE tags SET name = ? WHERE id = ?", (name.strip(), tag_id))
        if color is not None:
            conn.execute("UPDATE tags SET color = ? WHERE id = ?", (color, tag_id))
        if parent_id is not None:
            conn.execute("UPDATE tags SET parent_id = ? WHERE id = ?", (parent_id, tag_id))
        if kind is not None and kind in {"category", "facet", "custom"}:
            conn.execute("UPDATE tags SET kind = ? WHERE id = ?", (kind, tag_id))
        conn.commit()
    finally:
        conn.close()
    tags = [t for t in list_tags() if t["id"] == tag_id]
    return tags[0] if tags else None


def reorder_tags(ids: list[int]) -> list[dict]:
    if not ids:
        return list_tags()
    conn = connect()
    try:
        placeholders = ",".join("?" * len(ids))
        rows = conn.execute(
            f"SELECT id, kind, parent_id FROM tags WHERE id IN ({placeholders})",
            ids,
        ).fetchall()
        if len(rows) != len(set(ids)):
            raise ValueError("标签不存在")
        groups = {(row["kind"], row["parent_id"]) for row in rows}
        if len(groups) != 1:
            raise ValueError("只能在同一组内调整顺序")
        for index, tag_id in enumerate(ids):
            conn.execute("UPDATE tags SET sort_order = ? WHERE id = ?", (index, tag_id))
        conn.commit()
    finally:
        conn.close()
    return list_tags()


def delete_tag(tag_id: int) -> bool:
    conn = connect()
    try:
        row = conn.execute("SELECT id FROM tags WHERE id = ?", (tag_id,)).fetchone()
        if row is None:
            return False
        ids = expand_tag_ids(conn, [tag_id])
        placeholders = ",".join("?" * len(ids))
        conn.execute(f"DELETE FROM image_tags WHERE tag_id IN ({placeholders})", ids)
        conn.execute(f"DELETE FROM tags WHERE id IN ({placeholders})", ids)
        conn.commit()
        return True
    finally:
        conn.close()


def set_image_tags(image_id: int, tag_ids: list[int]) -> Optional[dict]:
    conn = connect()
    try:
        row = conn.execute("SELECT id FROM images WHERE id = ?", (image_id,)).fetchone()
        if row is None:
            return None
        resolved: list[int] = []
        for tid in dict.fromkeys(tag_ids):
            current = tid
            while current and current not in resolved:
                exists = conn.execute("SELECT id, parent_id FROM tags WHERE id = ?", (current,)).fetchone()
                if not exists:
                    break
                resolved.append(int(exists["id"]))
                current = exists["parent_id"]
        conn.execute("DELETE FROM image_tags WHERE image_id = ?", (image_id,))
        for tid in resolved:
            conn.execute(
                "INSERT OR IGNORE INTO image_tags(image_id, tag_id) VALUES (?, ?)",
                (image_id, tid),
            )
        conn.commit()
    finally:
        conn.close()
    return get_image(image_id)


def batch_tags(image_ids: list[int], add: list[int], remove: list[int]) -> dict:
    conn = connect()
    try:
        for image_id in image_ids:
            exists = conn.execute("SELECT id FROM images WHERE id = ?", (image_id,)).fetchone()
            if not exists:
                continue
            for tid in add:
                conn.execute(
                    "INSERT OR IGNORE INTO image_tags(image_id, tag_id) VALUES (?, ?)",
                    (image_id, tid),
                )
            for tid in remove:
                conn.execute(
                    "DELETE FROM image_tags WHERE image_id = ? AND tag_id = ?",
                    (image_id, tid),
                )
        conn.commit()
    finally:
        conn.close()
    return {"updated": image_ids}

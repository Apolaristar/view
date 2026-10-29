from __future__ import annotations

from core.database import connect
from core.pose_extractor import parse_landmarks, pose_similarity_distance


def search_by_landmarks(query_landmarks: list[dict], limit: int = 20, exclude_id: int | None = None) -> list[dict]:
    conn = connect()
    try:
        rows = conn.execute(
            """
            SELECT id, uid, thumbnail_path, original_path, pose_landmarks, width, height
            FROM images
            WHERE pose_status = 'ok' AND pose_landmarks IS NOT NULL
              AND COALESCE(in_library, 1) != 0
            """
        ).fetchall()
    finally:
        conn.close()

    scored: list[tuple[float, dict]] = []
    for row in rows:
        landmarks = parse_landmarks(row["pose_landmarks"])
        if not landmarks:
            continue
        dist = pose_similarity_distance(query_landmarks, landmarks)
        if exclude_id is not None and row["id"] == exclude_id:
            dist = 0.0
        scored.append(
            (
                dist,
                {
                    "id": row["id"],
                    "uid": row["uid"],
                    "thumbnail_path": row["thumbnail_path"],
                    "original_path": row["original_path"],
                    "width": row["width"],
                    "height": row["height"],
                    "distance": dist,
                },
            )
        )
    scored.sort(key=lambda x: x[0])
    return [item for _, item in scored[:limit]]

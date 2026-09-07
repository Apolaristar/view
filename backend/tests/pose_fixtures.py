from __future__ import annotations

import json
from pathlib import Path

from core.database import connect


def set_pose_landmarks(image_id: int, landmarks: list[dict], status: str = "ok") -> None:
    conn = connect()
    try:
        conn.execute(
            "UPDATE images SET pose_status = ?, pose_landmarks = ? WHERE id = ?",
            (status, json.dumps(landmarks), image_id),
        )
        conn.commit()
    finally:
        conn.close()


def standing_pose() -> list[dict]:
    pts = [{"id": i, "x": 0.5, "y": min(0.15 + i * 0.02, 0.98), "z": 0.0, "visibility": 0.99} for i in range(33)]
    pts[11] = {"id": 11, "x": 0.40, "y": 0.30, "z": 0.0, "visibility": 0.99}
    pts[12] = {"id": 12, "x": 0.60, "y": 0.30, "z": 0.0, "visibility": 0.99}
    pts[13] = {"id": 13, "x": 0.35, "y": 0.42, "z": 0.0, "visibility": 0.99}
    pts[14] = {"id": 14, "x": 0.65, "y": 0.42, "z": 0.0, "visibility": 0.99}
    pts[15] = {"id": 15, "x": 0.32, "y": 0.54, "z": 0.0, "visibility": 0.99}
    pts[16] = {"id": 16, "x": 0.68, "y": 0.54, "z": 0.0, "visibility": 0.99}
    pts[23] = {"id": 23, "x": 0.44, "y": 0.56, "z": 0.0, "visibility": 0.99}
    pts[24] = {"id": 24, "x": 0.56, "y": 0.56, "z": 0.0, "visibility": 0.99}
    pts[25] = {"id": 25, "x": 0.44, "y": 0.74, "z": 0.0, "visibility": 0.99}
    pts[26] = {"id": 26, "x": 0.56, "y": 0.74, "z": 0.0, "visibility": 0.99}
    pts[27] = {"id": 27, "x": 0.44, "y": 0.93, "z": 0.0, "visibility": 0.99}
    pts[28] = {"id": 28, "x": 0.56, "y": 0.93, "z": 0.0, "visibility": 0.99}
    return pts


def kick_pose() -> list[dict]:
    pts = standing_pose()
    pts[26] = {"id": 26, "x": 0.86, "y": 0.58, "z": 0.0, "visibility": 0.99}
    pts[28] = {"id": 28, "x": 0.96, "y": 0.50, "z": 0.0, "visibility": 0.99}
    pts[14] = {"id": 14, "x": 0.78, "y": 0.28, "z": 0.0, "visibility": 0.99}
    pts[16] = {"id": 16, "x": 0.88, "y": 0.18, "z": 0.0, "visibility": 0.99}
    return pts


def sit_pose() -> list[dict]:
    pts = standing_pose()
    pts[25] = {"id": 25, "x": 0.38, "y": 0.70, "z": 0.0, "visibility": 0.99}
    pts[26] = {"id": 26, "x": 0.62, "y": 0.70, "z": 0.0, "visibility": 0.99}
    pts[27] = {"id": 27, "x": 0.28, "y": 0.78, "z": 0.0, "visibility": 0.99}
    pts[28] = {"id": 28, "x": 0.72, "y": 0.78, "z": 0.0, "visibility": 0.99}
    pts[23] = {"id": 23, "x": 0.44, "y": 0.62, "z": 0.0, "visibility": 0.99}
    pts[24] = {"id": 24, "x": 0.56, "y": 0.62, "z": 0.0, "visibility": 0.99}
    return pts

from __future__ import annotations

import json
import queue
import threading
from typing import Optional

from core.color_extractor import extract_from_file
from core.database import connect
from core.paths import originals_dir
from core.pose_extractor import extract_pose

_jobs: queue.Queue[tuple[int, bool, bool]] = queue.Queue()
_thread: Optional[threading.Thread] = None
_lock = threading.Lock()


def _original_file(row) -> str:
    return str(originals_dir() / row["original_path"])


def process_image(image_id: int, pose: bool = True, color: bool = True, overwrite_families: bool = False) -> None:
    conn = connect()
    try:
        row = conn.execute("SELECT * FROM images WHERE id = ?", (image_id,)).fetchone()
        if row is None:
            return
        path = _original_file(row)
        if color:
            try:
                result = extract_from_file(path)
                if overwrite_families:
                    conn.execute("UPDATE images SET color_manual = 0 WHERE id = ?", (image_id,))
                current = conn.execute("SELECT color_manual FROM images WHERE id = ?", (image_id,)).fetchone()
                manual = bool(current["color_manual"]) if current and "color_manual" in current.keys() else False
                if manual and not overwrite_families:
                    conn.execute(
                        "UPDATE images SET palette = ?, color_status = 'ok' WHERE id = ?",
                        (json.dumps(result["palette"], ensure_ascii=False), image_id),
                    )
                else:
                    conn.execute(
                        """
                        UPDATE images
                        SET palette = ?, primary_family = ?, secondary_family = ?, color_status = 'ok'
                        WHERE id = ?
                        """,
                        (
                            json.dumps(result["palette"], ensure_ascii=False),
                            result["primary_family"],
                            result.get("secondary_family"),
                            image_id,
                        ),
                    )
            except Exception:
                conn.execute(
                    "UPDATE images SET color_status = 'failed' WHERE id = ?",
                    (image_id,),
                )
        if pose:
            try:
                status, landmarks = extract_pose(path)
                conn.execute(
                    """
                    UPDATE images
                    SET pose_status = ?, pose_landmarks = ?
                    WHERE id = ?
                    """,
                    (
                        status,
                        json.dumps(landmarks, ensure_ascii=False) if landmarks else None,
                        image_id,
                    ),
                )
            except Exception:
                conn.execute(
                    "UPDATE images SET pose_status = 'failed' WHERE id = ?",
                    (image_id,),
                )
        conn.commit()
    finally:
        conn.close()


def enqueue_image(image_id: int, pose: bool = True, color: bool = True) -> None:
    _jobs.put((image_id, pose, color))


def drain_sync() -> None:
    while True:
        try:
            image_id, pose, color = _jobs.get_nowait()
        except queue.Empty:
            break
        process_image(image_id, pose=pose, color=color)
        _jobs.task_done()


def jobs_summary() -> dict:
    conn = connect()
    try:
        pending = conn.execute(
            """
            SELECT COUNT(*) AS c FROM images
            WHERE pose_status = 'pending' OR color_status = 'pending'
            """
        ).fetchone()["c"]
        failed = conn.execute(
            """
            SELECT COUNT(*) AS c FROM images
            WHERE pose_status = 'failed' OR color_status = 'failed'
            """
        ).fetchone()["c"]
    finally:
        conn.close()
    return {"pending": pending, "failed": failed, "queued": _jobs.qsize()}


def _worker() -> None:
    while True:
        image_id, pose, color = _jobs.get()
        try:
            process_image(image_id, pose=pose, color=color)
        finally:
            _jobs.task_done()


def start_worker() -> None:
    import os

    if os.environ.get("POSEBOARD_DISABLE_WORKER") == "1":
        return
    global _thread
    with _lock:
        if _thread is not None and _thread.is_alive():
            return
        _thread = threading.Thread(target=_worker, name="poseboard-queue", daemon=True)
        _thread.start()

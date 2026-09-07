from __future__ import annotations

import os
import threading
import urllib.request
from pathlib import Path
from typing import Optional

import numpy as np
from PIL import Image

LEFT_RIGHT_PAIRS = [
    (1, 4),
    (2, 5),
    (3, 6),
    (7, 8),
    (9, 10),
    (11, 12),
    (13, 14),
    (15, 16),
    (17, 18),
    (19, 20),
    (21, 22),
    (23, 24),
    (25, 26),
    (27, 28),
    (29, 30),
    (31, 32),
]

WEIGHTS = {
    0: 0.4,
    11: 1.4,
    12: 1.4,
    13: 1.1,
    14: 1.1,
    15: 1.0,
    16: 1.0,
    23: 1.5,
    24: 1.5,
    25: 1.2,
    26: 1.2,
    27: 1.0,
    28: 1.0,
}

VISIBILITY_MIN = 0.5
MODEL_URL = (
    "https://storage.googleapis.com/mediapipe-models/"
    "pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task"
)

_landmarker = None
_landmarker_lock = threading.Lock()


def model_file() -> Path:
    override = os.environ.get("POSEBOARD_MODEL_DIR")
    if override:
        root = Path(override)
    else:
        local = os.environ.get("LOCALAPPDATA") or str(Path.home() / "AppData" / "Local")
        root = Path(local) / "PoseBoard" / "models"
    root.mkdir(parents=True, exist_ok=True)
    return root / "pose_landmarker_lite.task"


def ensure_model() -> Path:
    path = model_file()
    if path.exists() and path.stat().st_size > 1000:
        return path
    tmp = path.with_suffix(".task.download")
    urllib.request.urlretrieve(MODEL_URL, tmp)
    tmp.replace(path)
    return path


def get_landmarker():
    global _landmarker
    import mediapipe as mp
    from mediapipe.tasks import python
    from mediapipe.tasks.python import vision

    with _landmarker_lock:
        if _landmarker is None:
            model_path = ensure_model()
            options = vision.PoseLandmarkerOptions(
                base_options=python.BaseOptions(model_asset_path=str(model_path)),
                running_mode=vision.RunningMode.IMAGE,
                num_poses=1,
                min_pose_detection_confidence=0.5,
            )
            _landmarker = vision.PoseLandmarker.create_from_options(options)
        return _landmarker


def landmarks_from_task(result) -> Optional[list[dict]]:
    if result is None or not result.pose_landmarks:
        return None
    pose = result.pose_landmarks[0]
    out = []
    for i, lm in enumerate(pose):
        vis = getattr(lm, "visibility", None)
        out.append(
            {
                "id": i,
                "x": float(lm.x),
                "y": float(lm.y),
                "z": float(lm.z),
                "visibility": float(vis) if vis not in (None, 0) else 1.0,
            }
        )
    return out


def extract_pose(image_path) -> tuple[str, Optional[list[dict]]]:
    """Return (status, landmarks). status in ok|none|failed."""
    try:
        import mediapipe as mp

        landmarker = get_landmarker()
        with Image.open(image_path) as im:
            rgb = np.asarray(im.convert("RGB"))
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
        result = landmarker.detect(mp_image)
        landmarks = landmarks_from_task(result)
        if landmarks is None:
            return "none", None
        return "ok", landmarks
    except Exception:  # noqa: BLE001
        return "failed", None


def _get(points: list[dict], idx: int) -> Optional[dict]:
    if idx < 0 or idx >= len(points):
        return None
    p = points[idx]
    if p.get("visibility", 0) < VISIBILITY_MIN:
        return None
    return p


def align_points(points: list[dict]) -> dict[int, np.ndarray]:
    hip_l = _get(points, 23)
    hip_r = _get(points, 24)
    sh_l = _get(points, 11)
    sh_r = _get(points, 12)
    if hip_l and hip_r:
        origin = np.array(
            [(hip_l["x"] + hip_r["x"]) / 2, (hip_l["y"] + hip_r["y"]) / 2],
            dtype=np.float64,
        )
    else:
        vis = [p for p in points if p.get("visibility", 0) >= VISIBILITY_MIN]
        origin = np.array(
            [np.mean([p["x"] for p in vis]), np.mean([p["y"] for p in vis])],
            dtype=np.float64,
        )
    scale = 0.0
    if hip_l and hip_r and sh_l and sh_r:
        shoulder = np.array(
            [(sh_l["x"] + sh_r["x"]) / 2, (sh_l["y"] + sh_r["y"]) / 2],
            dtype=np.float64,
        )
        scale = float(np.linalg.norm(shoulder - origin))
    if scale < 1e-6 and sh_l and sh_r:
        scale = float(
            np.linalg.norm(
                np.array([sh_l["x"] - sh_r["x"], sh_l["y"] - sh_r["y"]], dtype=np.float64)
            )
        )
    if scale < 1e-6:
        scale = 1.0
    aligned: dict[int, np.ndarray] = {}
    for p in points:
        if p.get("visibility", 0) < VISIBILITY_MIN:
            continue
        xy = np.array([p["x"], p["y"]], dtype=np.float64)
        aligned[int(p["id"])] = (xy - origin) / scale
    return aligned


def mirror_landmarks(points: list[dict]) -> list[dict]:
    swapped = {int(p["id"]): dict(p) for p in points}
    for a, b in LEFT_RIGHT_PAIRS:
        if a in swapped and b in swapped:
            swapped[a], swapped[b] = swapped[b], swapped[a]
            swapped[a]["id"] = a
            swapped[b]["id"] = b
    out = []
    for p in swapped.values():
        q = dict(p)
        q["x"] = 1.0 - float(q["x"])
        out.append(q)
    out.sort(key=lambda x: x["id"])
    return out


def pose_distance(a: list[dict], b: list[dict]) -> float:
    aa = align_points(a)
    bb = align_points(b)
    total = 0.0
    wsum = 0.0
    for idx, pa in aa.items():
        pb = bb.get(idx)
        if pb is None:
            continue
        w = WEIGHTS.get(idx, 0.7)
        total += w * float(np.linalg.norm(pa - pb))
        wsum += w
    if wsum == 0:
        return 1e9
    return total / wsum


def pose_similarity_distance(query: list[dict], candidate: list[dict]) -> float:
    d1 = pose_distance(query, candidate)
    d2 = pose_distance(mirror_landmarks(query), candidate)
    return min(d1, d2)


def parse_landmarks(raw) -> Optional[list[dict]]:
    import json

    if not raw:
        return None
    if isinstance(raw, list):
        return raw
    try:
        data = json.loads(raw)
        if isinstance(data, list):
            return data
    except json.JSONDecodeError:
        return None
    return None

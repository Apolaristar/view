from __future__ import annotations

import os
import threading
import urllib.request
from pathlib import Path
from typing import Optional

import numpy as np
from PIL import Image

# Nose + shoulders, elbows, wrists, hips, knees, ankles. Face/hands/heels are ignored.
BODY_LANDMARK_IDS = (0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28)
BODY_LANDMARK_SET = set(BODY_LANDMARK_IDS)

LEFT_RIGHT_PAIRS = [
    (11, 12),
    (13, 14),
    (15, 16),
    (23, 24),
    (25, 26),
    (27, 28),
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
MAX_POSES = 5
MIN_PERSON_AREA = 0.004
MIN_FACE_AREA = 0.002
FACE_MATCH_IOU = 0.02
MODEL_URL = (
    "https://storage.googleapis.com/mediapipe-models/"
    "pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task"
)
FACE_MODEL_URL = (
    "https://storage.googleapis.com/mediapipe-models/"
    "face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite"
)

# BlazeFace 6 keypoints → our landmark ids (left/right = person's left/right).
FACE_KP_TO_ID = (5, 2, 0, 9, 8, 7)
FACE_IDS = (0, 2, 5, 7, 8, 9)

_landmarker = None
_face_detector = None
_landmarker_lock = threading.Lock()


def model_dir() -> Path:
    override = os.environ.get("POSEBOARD_MODEL_DIR")
    if override:
        root = Path(override)
    else:
        local = os.environ.get("LOCALAPPDATA") or str(Path.home() / "AppData" / "Local")
        root = Path(local) / "PoseBoard" / "models"
    root.mkdir(parents=True, exist_ok=True)
    return root


def model_file() -> Path:
    return model_dir() / "pose_landmarker_lite.task"


def face_model_file() -> Path:
    return model_dir() / "blaze_face_short_range.tflite"


def ensure_model() -> Path:
    path = model_file()
    if path.exists() and path.stat().st_size > 1000:
        return path
    tmp = path.with_suffix(".task.download")
    urllib.request.urlretrieve(MODEL_URL, tmp)
    tmp.replace(path)
    return path


def ensure_face_model() -> Path:
    path = face_model_file()
    if path.exists() and path.stat().st_size > 1000:
        return path
    tmp = path.with_suffix(".tflite.download")
    urllib.request.urlretrieve(FACE_MODEL_URL, tmp)
    tmp.replace(path)
    return path


def get_landmarker():
    global _landmarker
    from mediapipe.tasks import python
    from mediapipe.tasks.python import vision

    with _landmarker_lock:
        if _landmarker is None:
            model_path = ensure_model()
            options = vision.PoseLandmarkerOptions(
                base_options=python.BaseOptions(model_asset_path=str(model_path)),
                running_mode=vision.RunningMode.IMAGE,
                num_poses=MAX_POSES,
                min_pose_detection_confidence=0.5,
            )
            _landmarker = vision.PoseLandmarker.create_from_options(options)
        return _landmarker


def get_face_detector():
    global _face_detector
    from mediapipe.tasks import python
    from mediapipe.tasks.python import vision

    with _landmarker_lock:
        if _face_detector is False:
            return None
        if _face_detector is None:
            try:
                model_path = ensure_face_model()
                options = vision.FaceDetectorOptions(
                    base_options=python.BaseOptions(model_asset_path=str(model_path)),
                    running_mode=vision.RunningMode.IMAGE,
                    min_detection_confidence=0.45,
                )
                _face_detector = vision.FaceDetector.create_from_options(options)
            except Exception:  # noqa: BLE001
                _face_detector = False
                return None
        return _face_detector


def _points_from_pose(pose) -> list[dict]:
    out = []
    for i, lm in enumerate(pose):
        vis = getattr(lm, "visibility", None)
        out.append(
            {
                "id": i,
                "x": float(lm.x),
                "y": float(lm.y),
                "z": float(lm.z),
                "visibility": float(vis) if vis is not None else 1.0,
            }
        )
    return out


def _visible_ids(points: list[dict], wanted: set[int]) -> list[dict]:
    return [
        p
        for p in points
        if int(p.get("id", -1)) in wanted and float(p.get("visibility") or 0) >= VISIBILITY_MIN
    ]


def person_area(points: list[dict]) -> float:
    vis = _visible_ids(points, BODY_LANDMARK_SET)
    if len(vis) < 2:
        vis = _visible_ids(points, set(FACE_IDS))
    if len(vis) < 2:
        return 0.0
    xs = [float(p["x"]) for p in vis]
    ys = [float(p["y"]) for p in vis]
    return max(0.0, max(xs) - min(xs)) * max(0.0, max(ys) - min(ys))


def keep_body_landmarks(points: list[dict]) -> list[dict]:
    return [dict(p) for p in points if int(p.get("id", -1)) in BODY_LANDMARK_SET]


def split_people(landmarks: Optional[list[dict]]) -> list[list[dict]]:
    buckets: dict[int, list[dict]] = {}
    for point in landmarks or []:
        try:
            person = int(point.get("person", 0) or 0)
        except (TypeError, ValueError):
            person = 0
        buckets.setdefault(person, []).append(point)
    return [buckets[key] for key in sorted(buckets)]


def primary_landmarks(landmarks: Optional[list[dict]]) -> list[dict]:
    people = split_people(landmarks)
    return people[0] if people else []


def people_count(landmarks: Optional[list[dict]]) -> int:
    return len(split_people(landmarks))


def _pack_people(ranked: list[tuple[float, list[dict]]]) -> Optional[list[dict]]:
    if not ranked:
        return None
    ranked.sort(key=lambda item: item[0], reverse=True)
    out: list[dict] = []
    for person, (_, pts) in enumerate(ranked[:MAX_POSES]):
        for point in pts:
            item = dict(point)
            item["person"] = person
            out.append(item)
    return out


def people_from_pose(result) -> list[list[dict]]:
    if result is None or not result.pose_landmarks:
        return []
    ranked: list[tuple[float, list[dict]]] = []
    for pose in result.pose_landmarks[:MAX_POSES]:
        pts = keep_body_landmarks(_points_from_pose(pose))
        area = person_area(pts)
        if area < MIN_PERSON_AREA:
            continue
        ranked.append((area, pts))
    ranked.sort(key=lambda item: item[0], reverse=True)
    return [pts for _, pts in ranked]


def landmarks_from_task(result) -> Optional[list[dict]]:
    people = people_from_pose(result)
    return _pack_people([(person_area(pts), pts) for pts in people])


def _box_from_points(points: list[dict]) -> Optional[tuple[float, float, float, float]]:
    vis = _visible_ids(points, BODY_LANDMARK_SET) or _visible_ids(points, set(FACE_IDS))
    if len(vis) < 2:
        return None
    xs = [float(p["x"]) for p in vis]
    ys = [float(p["y"]) for p in vis]
    return min(xs), min(ys), max(xs), max(ys)


def _iou(a: tuple[float, float, float, float], b: tuple[float, float, float, float]) -> float:
    ax0, ay0, ax1, ay1 = a
    bx0, by0, bx1, by1 = b
    ix0, iy0 = max(ax0, bx0), max(ay0, by0)
    ix1, iy1 = min(ax1, bx1), min(ay1, by1)
    inter = max(0.0, ix1 - ix0) * max(0.0, iy1 - iy0)
    if inter <= 0:
        return 0.0
    area_a = max(0.0, ax1 - ax0) * max(0.0, ay1 - ay0)
    area_b = max(0.0, bx1 - bx0) * max(0.0, by1 - by0)
    return inter / max(area_a + area_b - inter, 1e-9)


def _center_in(cx: float, cy: float, box: Optional[tuple[float, float, float, float]]) -> bool:
    if box is None:
        return False
    x0, y0, x1, y1 = box
    return x0 <= cx <= x1 and y0 <= cy <= y1


def _replace_face(points: list[dict], face_points: list[dict]) -> list[dict]:
    kept = [p for p in points if int(p.get("id", -1)) not in FACE_IDS]
    return kept + [dict(p) for p in face_points]


def _detection_score(det) -> float:
    cats = getattr(det, "categories", None) or []
    if cats:
        try:
            return float(cats[0].score)
        except (AttributeError, TypeError, ValueError, IndexError):
            return 0.0
    return 0.0


def faces_from_task(result, width: int, height: int) -> list[dict]:
    if result is None or not getattr(result, "detections", None):
        return []
    w = max(int(width), 1)
    h = max(int(height), 1)
    out: list[dict] = []
    for det in result.detections[:MAX_POSES]:
        bb = getattr(det, "bounding_box", None)
        if bb is None:
            continue
        x0 = float(bb.origin_x) / w
        y0 = float(bb.origin_y) / h
        x1 = (float(bb.origin_x) + float(bb.width)) / w
        y1 = (float(bb.origin_y) + float(bb.height)) / h
        area = max(0.0, x1 - x0) * max(0.0, y1 - y0)
        points: list[dict] = []
        for i, kp in enumerate(list(det.keypoints or [])[:6]):
            points.append(
                {
                    "id": FACE_KP_TO_ID[i],
                    "x": float(kp.x),
                    "y": float(kp.y),
                    "z": 0.0,
                    "visibility": 1.0,
                }
            )
        if len(points) < 3:
            continue
        out.append(
            {
                "box": (x0, y0, x1, y1),
                "area": area,
                "points": points,
                "score": _detection_score(det),
                "cx": (x0 + x1) / 2,
                "cy": (y0 + y1) / 2,
            }
        )
    out.sort(key=lambda item: item["score"], reverse=True)
    return out


def merge_people_and_faces(people: list[list[dict]], faces: list[dict]) -> Optional[list[dict]]:
    used: set[int] = set()
    ranked: list[tuple[float, list[dict]]] = []
    for pts in people:
        box = _box_from_points(pts)
        best_i = -1
        best_score = 0.0
        for i, face in enumerate(faces):
            if i in used:
                continue
            iou = _iou(box, face["box"]) if box else 0.0
            inside = _center_in(face["cx"], face["cy"], box)
            score = iou + (0.15 if inside else 0.0)
            if score > best_score and (iou >= FACE_MATCH_IOU or inside):
                best_score = score
                best_i = i
        area = person_area(pts)
        if best_i >= 0:
            used.add(best_i)
            pts = _replace_face(pts, faces[best_i]["points"])
            area = max(area, float(faces[best_i]["area"]))
        ranked.append((area, pts))
    for i, face in enumerate(faces):
        if i in used:
            continue
        if float(face["area"]) < MIN_FACE_AREA:
            continue
        ranked.append((float(face["area"]), [dict(p) for p in face["points"]]))
    return _pack_people(ranked)


def _detect_faces(mp_image, width: int, height: int) -> list[dict]:
    try:
        detector = get_face_detector()
        if detector is None:
            return []
        return faces_from_task(detector.detect(mp_image), width, height)
    except Exception:  # noqa: BLE001
        return []


def extract_pose(image_path) -> tuple[str, Optional[list[dict]]]:
    """Return (status, landmarks). status in ok|none|failed."""
    try:
        import mediapipe as mp

        landmarker = get_landmarker()
        with Image.open(image_path) as im:
            rgb = np.asarray(im.convert("RGB"))
        height, width = rgb.shape[:2]
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
        result = landmarker.detect(mp_image)
        people = people_from_pose(result)
        faces = _detect_faces(mp_image, width, height)
        landmarks = merge_people_and_faces(people, faces)
        if landmarks is None:
            return "none", None
        return "ok", landmarks
    except Exception:  # noqa: BLE001
        return "failed", None


def _get(points: list[dict], idx: int) -> Optional[dict]:
    for point in points:
        try:
            if int(point.get("id", -1)) != idx:
                continue
        except (TypeError, ValueError):
            continue
        if float(point.get("visibility") or 0) < VISIBILITY_MIN:
            return None
        return point
    return None


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
        vis = [
            p
            for p in points
            if int(p["id"]) in BODY_LANDMARK_SET and p.get("visibility", 0) >= VISIBILITY_MIN
        ]
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
        idx = int(p["id"])
        if idx not in BODY_LANDMARK_SET or p.get("visibility", 0) < VISIBILITY_MIN:
            continue
        xy = np.array([p["x"], p["y"]], dtype=np.float64)
        aligned[idx] = (xy - origin) / scale
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
    for idx in BODY_LANDMARK_IDS:
        pa = aa.get(idx)
        pb = bb.get(idx)
        if pa is None or pb is None:
            continue
        w = WEIGHTS[idx]
        total += w * float(np.linalg.norm(pa - pb))
        wsum += w
    if wsum == 0:
        return 1e9
    return total / wsum


def pose_similarity_distance(query: list[dict], candidate: list[dict]) -> float:
    q_people = split_people(query) or [query]
    c_people = split_people(candidate) or [candidate]
    query_pose = q_people[0]
    mirrored = mirror_landmarks(query_pose)
    best = 1e9
    for person in c_people:
        best = min(best, pose_distance(query_pose, person), pose_distance(mirrored, person))
    return best


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


def _in_frame(point: dict) -> bool:
    try:
        x = float(point.get("x", 0))
        y = float(point.get("y", 0))
    except (TypeError, ValueError):
        return False
    return -0.08 <= x <= 1.08 and -0.08 <= y <= 1.08


def visible_landmarks(landmarks: Optional[list[dict]]) -> dict[int, dict]:
    out: dict[int, dict] = {}
    for point in landmarks or []:
        try:
            idx = int(point.get("id", -1))
        except (TypeError, ValueError):
            continue
        if idx < 0:
            continue
        if float(point.get("visibility") or 0) < VISIBILITY_MIN:
            continue
        if not _in_frame(point):
            continue
        out[idx] = point
    return out


def visible_landmark_ids(landmarks: Optional[list[dict]]) -> set[int]:
    return set(visible_landmarks(landmarks))


def _eye_pair_geom(left: dict, right: dict, nose: dict) -> tuple[float, float, float]:
    lx, rx = float(left["x"]), float(right["x"])
    nx = float(nose["x"])
    span = abs(rx - lx)
    mid = (lx + rx) / 2
    offset = abs(nx - mid) / max(span, 1e-3)
    lo, hi = (lx, rx) if lx <= rx else (rx, lx)
    if nx < lo:
        past = (lo - nx) / max(span, 1e-3)
    elif nx > hi:
        past = (nx - hi) / max(span, 1e-3)
    else:
        past = 0.0
    return span, offset, past


def _face_scale(pts: dict[int, dict]) -> float:
    left_ear, right_ear = pts.get(7), pts.get(8)
    if left_ear and right_ear:
        span = abs(float(left_ear["x"]) - float(right_ear["x"]))
        if span >= 0.01:
            return span
    left, right = pts.get(2), pts.get(5)
    if left and right:
        span = abs(float(left["x"]) - float(right["x"]))
        if span >= 0.01:
            return span
    xs = [float(pts[i]["x"]) for i in FACE_IDS if i in pts]
    if len(xs) >= 2:
        return max(xs) - min(xs)
    return 0.0


def infer_head_yaw(landmarks: Optional[list[dict]]) -> str:
    """正脸 / 半侧 / 全侧。只看主体的脸，全身图同样判断。

    全侧: 只能看清一只眼；或两眼贴在一起、鼻子落到眼轮廓外侧。
    半侧: 两眼都分开看得见，鼻子明显偏向一侧。
    正脸: 两眼分开，鼻子靠近两眼中线。
    脸在画面里太小（远景小人）时关键点不可信，不当全侧。
    两眼明显拉开时人能看清两只眼，也不当全侧。
    """
    pts = visible_landmarks(primary_landmarks(landmarks))
    if not pts:
        return "unknown"
    left = pts.get(2)
    right = pts.get(5)
    nose = pts.get(0)
    if not nose:
        return "unknown"
    if bool(left) != bool(right):
        return "front" if _face_scale(pts) < 0.035 else "profile"
    if not (left and right):
        return "unknown"
    scale = _face_scale(pts)
    span, offset, past = _eye_pair_geom(left, right, nose)
    if scale < 0.035:
        if offset >= 0.28 and span >= 0.025:
            return "three_quarter"
        return "front"
    rel = span / max(scale, 1e-3)
    if rel > 0.48 and span >= 0.028:
        if offset >= 0.28:
            return "three_quarter"
        return "front"
    if span < 0.020 or past >= 0.18 or (offset >= 0.70 and rel <= 0.45):
        return "profile"
    if offset >= 0.28:
        return "three_quarter"
    return "front"


def infer_body_framing(landmarks: Optional[list[dict]]) -> str:
    vis = visible_landmark_ids(primary_landmarks(landmarks))
    if not vis:
        return "unknown"
    has_legs = bool(vis & {25, 26, 27, 28})
    has_waist = bool(vis & {23, 24})
    has_shoulders = bool(vis & {11, 12})
    has_head = bool(vis & set(FACE_IDS))
    if has_legs:
        return "full"
    if has_waist:
        return "half"
    if has_shoulders:
        return "bust"
    if has_head:
        return "head"
    return "unknown"

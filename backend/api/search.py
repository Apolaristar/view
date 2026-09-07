from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, Request, UploadFile

from core.images import get_image
from core.pose_extractor import extract_pose
from core.pose_search import search_by_landmarks

router = APIRouter()


@router.post("/search/by-pose")
async def search_by_pose(request: Request):
    image_id = None
    upload: UploadFile | None = None
    ctype = request.headers.get("content-type", "")
    if "multipart/form-data" in ctype:
        form = await request.form()
        raw_id = form.get("image_id")
        if raw_id not in (None, "", "null"):
            image_id = int(str(raw_id))
        maybe_file = form.get("file")
        if maybe_file is not None and hasattr(maybe_file, "read"):
            upload = maybe_file
    elif request.method == "POST":
        try:
            body = await request.json()
        except Exception:
            body = {}
        if isinstance(body, dict):
            image_id = body.get("image_id")

    query_landmarks = None
    source_item = None
    if image_id is not None:
        item = get_image(int(image_id))
        if item is None:
            return {"code": 1, "data": None, "msg": "图片不存在"}
        if item["pose_status"] != "ok" or not item["pose_landmarks"]:
            return {"code": 1, "data": None, "msg": "该图没有可用的姿态数据"}
        query_landmarks = item["pose_landmarks"]
        source_item = item
    elif upload is not None:
        suffix = Path(upload.filename or "query.jpg").suffix or ".jpg"
        import tempfile

        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
            content = await upload.read()
            tmp.write(content)
            tmp_path = tmp.name
        status, landmarks = extract_pose(tmp_path)
        Path(tmp_path).unlink(missing_ok=True)
        if status != "ok" or not landmarks:
            return {"code": 1, "data": None, "msg": "检测不到人体"}
        query_landmarks = landmarks
    else:
        conn_images = None
        from core.database import connect

        conn = connect()
        try:
            conn_images = conn.execute("SELECT COUNT(*) AS c FROM images").fetchone()["c"]
        finally:
            conn.close()
        if conn_images == 0:
            return {"code": 0, "data": {"items": [], "total": 0, "empty": True}, "msg": "图库为空"}
        return {"code": 1, "data": None, "msg": "请上传图片或提供图库图片 id"}

    results = search_by_landmarks(query_landmarks, limit=20)
    if source_item is not None:
        source_id = source_item["id"]
        results.sort(key=lambda r: (0 if r["id"] == source_id else 1, r["distance"]))
        if not results or results[0]["id"] != source_id:
            self_hit = next((r for r in results if r["id"] == source_id), None)
            if self_hit is None:
                self_hit = {
                    "id": source_id,
                    "uid": source_item["uid"],
                    "thumbnail_path": source_item["thumbnail_path"],
                    "original_path": source_item["original_path"],
                    "width": source_item["width"],
                    "height": source_item["height"],
                    "distance": 0.0,
                }
            results = [self_hit] + [r for r in results if r["id"] != source_id]
        results = results[:20]
    return {"code": 0, "data": {"items": results, "total": len(results)}, "msg": ""}

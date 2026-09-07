from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse

from core.images import (
    board_refs,
    delete_image,
    get_image,
    list_images,
    patch_image,
)
from core.importer import import_paths
from core.paths import originals_dir, thumbnails_dir
from core.queue import enqueue_image, jobs_summary, process_image
from models.schemas import ImagePatch, ImportRequest, ReprocessRequest

router = APIRouter()


@router.post("/images/import")
def images_import(body: ImportRequest):
    result = import_paths(body.paths)
    return {"code": 0, "data": result, "msg": ""}


@router.get("/images")
def images_list(
    tag_ids: str = "",
    families: str = "",
    secondary: str = "",
    angle: str = "",
    pose_status: str = "",
    q: str = "",
    failed: int = 0,
    limit: int = 60,
    offset: int = 0,
):
    parsed_tags = [int(x) for x in tag_ids.split(",") if x.strip().isdigit()]
    parsed_families = [x.strip() for x in families.split(",") if x.strip()]
    parsed_secondary = [x.strip() for x in secondary.split(",") if x.strip()]
    data = list_images(
        tag_ids=parsed_tags or None,
        families=parsed_families or None,
        secondary=parsed_secondary or None,
        angle=angle or None,
        pose_status=pose_status or None,
        q=q or None,
        failed=bool(failed),
        limit=limit,
        offset=offset,
    )
    return {"code": 0, "data": data, "msg": ""}


@router.get("/images/{image_id}")
def images_get(image_id: int):
    item = get_image(image_id)
    if item is None:
        raise HTTPException(status_code=404, detail="图片不存在")
    return {"code": 0, "data": item, "msg": ""}


@router.patch("/images/{image_id}")
def images_patch(image_id: int, body: ImagePatch):
    item = patch_image(
        image_id,
        camera_angle=body.camera_angle,
        notes=body.notes,
        primary_family=body.primary_family,
        secondary_family=body.secondary_family,
        extra_families=body.extra_families,
    )
    if item is None:
        raise HTTPException(status_code=404, detail="图片不存在")
    return {"code": 0, "data": item, "msg": ""}


@router.delete("/images/{image_id}")
def images_delete(image_id: int):
    item = delete_image(image_id)
    if item is None:
        raise HTTPException(status_code=404, detail="图片不存在")
    return {"code": 0, "data": item, "msg": ""}


@router.get("/images/{image_id}/board-refs")
def images_board_refs(image_id: int):
    if get_image(image_id) is None:
        raise HTTPException(status_code=404, detail="图片不存在")
    return {"code": 0, "data": board_refs(image_id), "msg": ""}


@router.post("/images/{image_id}/reprocess")
def images_reprocess(image_id: int, body: ReprocessRequest):
    if get_image(image_id) is None:
        raise HTTPException(status_code=404, detail="图片不存在")
    process_image(image_id, pose=body.pose, color=body.color, overwrite_families=body.color)
    return {"code": 0, "data": get_image(image_id), "msg": ""}


@router.get("/jobs/summary")
def jobs():
    return {"code": 0, "data": jobs_summary(), "msg": ""}

from __future__ import annotations

import sqlite3

from fastapi import APIRouter, HTTPException

from core.images import (
    batch_tags,
    create_tag,
    delete_tag,
    get_image,
    list_tags,
    patch_tag,
    reorder_tags,
    set_image_tags,
)
from models.schemas import BatchTagsRequest, ImageTagsPut, TagCreate, TagPatch, TagReorder

router = APIRouter()


@router.get("/tags")
def tags_list():
    return {"code": 0, "data": list_tags(), "msg": ""}


@router.post("/tags")
def tags_create(body: TagCreate):
    name = body.name.strip()
    if not name:
        return {"code": 1, "data": None, "msg": "标签名不能为空"}
    try:
        tag = create_tag(name, body.color, parent_id=body.parent_id, kind=body.kind)
        return {"code": 0, "data": tag, "msg": ""}
    except ValueError as exc:
        return {"code": 1, "data": None, "msg": str(exc)}
    except sqlite3.IntegrityError:
        return {"code": 1, "data": None, "msg": "标签名已存在"}


@router.put("/tags/reorder")
def tags_reorder(body: TagReorder):
    try:
        return {"code": 0, "data": reorder_tags(body.ids), "msg": ""}
    except ValueError as exc:
        return {"code": 1, "data": None, "msg": str(exc)}


@router.patch("/tags/{tag_id}")
def tags_patch(tag_id: int, body: TagPatch):
    try:
        tag = patch_tag(tag_id, name=body.name, color=body.color, parent_id=body.parent_id, kind=body.kind)
    except sqlite3.IntegrityError:
        return {"code": 1, "data": None, "msg": "标签名已存在"}
    if tag is None:
        raise HTTPException(status_code=404, detail="标签不存在")
    return {"code": 0, "data": tag, "msg": ""}


@router.delete("/tags/{tag_id}")
def tags_delete(tag_id: int):
    if not delete_tag(tag_id):
        raise HTTPException(status_code=404, detail="标签不存在")
    return {"code": 0, "data": {"deleted_id": tag_id}, "msg": ""}


@router.put("/images/{image_id}/tags")
def images_tags_put(image_id: int, body: ImageTagsPut):
    item = set_image_tags(image_id, body.tag_ids)
    if item is None:
        raise HTTPException(status_code=404, detail="图片不存在")
    return {"code": 0, "data": item, "msg": ""}


@router.post("/images/batch-tags")
def images_batch_tags(body: BatchTagsRequest):
    return {"code": 0, "data": batch_tags(body.image_ids, body.add, body.remove), "msg": ""}

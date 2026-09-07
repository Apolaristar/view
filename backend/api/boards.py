from __future__ import annotations

from fastapi import APIRouter, HTTPException

from core.boards import (
    add_item,
    add_tray_images,
    create_board,
    delete_board,
    delete_board_preview,
    delete_item,
    get_board,
    list_boards,
    patch_board,
    remove_tray_image,
    save_board_preview,
    save_layout,
)
from core.database import connect, set_setting
from models.schemas import BoardCreate, BoardItemCreate, BoardLayout, BoardPatch, BoardPreviewIn, BoardTrayAdd

router = APIRouter()


@router.get("/boards")
def boards_list():
    return {"code": 0, "data": list_boards(), "msg": ""}


@router.post("/boards")
def boards_create(body: BoardCreate):
    return {"code": 0, "data": create_board(body.name), "msg": ""}


@router.get("/boards/{board_id}")
def boards_get(board_id: int):
    board = get_board(board_id)
    if board is None:
        raise HTTPException(status_code=404, detail="画板不存在")
    conn = connect()
    try:
        set_setting(conn, "last_opened_board_id", str(board_id))
        conn.commit()
    finally:
        conn.close()
    return {"code": 0, "data": board, "msg": ""}


@router.patch("/boards/{board_id}")
def boards_patch(board_id: int, body: BoardPatch):
    board = patch_board(
        board_id,
        name=body.name,
        pan_x=body.pan_x,
        pan_y=body.pan_y,
        zoom=body.zoom,
    )
    if board is None:
        raise HTTPException(status_code=404, detail="画板不存在")
    return {"code": 0, "data": board, "msg": ""}


@router.delete("/boards/{board_id}")
def boards_delete(board_id: int):
    if not delete_board(board_id):
        raise HTTPException(status_code=404, detail="画板不存在")
    return {"code": 0, "data": {"deleted_id": board_id}, "msg": ""}


@router.put("/boards/{board_id}/layout")
def boards_layout(board_id: int, body: BoardLayout):
    items = [item.model_dump() for item in body.items]
    board = save_layout(board_id, body.pan_x, body.pan_y, body.zoom, items)
    if board is None:
        raise HTTPException(status_code=404, detail="画板不存在")
    return {"code": 0, "data": board, "msg": ""}


@router.post("/boards/{board_id}/items")
def boards_add_item(board_id: int, body: BoardItemCreate):
    item = add_item(board_id, body.image_id, body.x, body.y, body.width, body.height)
    if item is None:
        raise HTTPException(status_code=404, detail="画板或图片不存在")
    return {"code": 0, "data": item, "msg": ""}


@router.post("/boards/{board_id}/tray")
def boards_add_tray(board_id: int, body: BoardTrayAdd):
    board = add_tray_images(board_id, body.image_ids)
    if board is None:
        raise HTTPException(status_code=404, detail="画板不存在")
    return {"code": 0, "data": board, "msg": ""}


@router.delete("/boards/{board_id}/tray/{image_id}")
def boards_remove_tray(board_id: int, image_id: int):
    board = remove_tray_image(board_id, image_id)
    if board is None:
        raise HTTPException(status_code=404, detail="画板不存在")
    return {"code": 0, "data": board, "msg": ""}


@router.post("/boards/{board_id}/preview")
def boards_save_preview(board_id: int, body: BoardPreviewIn):
    board = save_board_preview(board_id, body.image)
    if board is None:
        raise HTTPException(status_code=404, detail="画板不存在或预览无效")
    return {"code": 0, "data": board, "msg": ""}


@router.delete("/boards/{board_id}/preview")
def boards_delete_preview(board_id: int):
    if get_board(board_id) is None:
        raise HTTPException(status_code=404, detail="画板不存在")
    delete_board_preview(board_id)
    return {"code": 0, "data": get_board(board_id), "msg": ""}


@router.delete("/board-items/{item_id}")
def boards_delete_item(item_id: int):
    if not delete_item(item_id):
        raise HTTPException(status_code=404, detail="图卡不存在")
    return {"code": 0, "data": {"deleted_id": item_id}, "msg": ""}

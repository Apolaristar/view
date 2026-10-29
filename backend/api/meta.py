from __future__ import annotations

from fastapi import APIRouter, HTTPException

from core.backup import create_backup, list_backups, restore_backup
from core.database import connect, get_setting, set_setting
from core.home import home_summary
from core.paths import get_data_root
from core.queue import enqueue_library
from models.schemas import BackupCreate, LibraryReprocessRequest, SettingsPut

router = APIRouter()


@router.get("/home/summary")
def home():
    return {"code": 0, "data": home_summary(), "msg": ""}


@router.get("/settings")
def settings_get():
    conn = connect()
    try:
        rows = conn.execute("SELECT key, value FROM settings").fetchall()
        data = {r["key"]: r["value"] for r in rows}
        data["data_path"] = str(get_data_root())
        return {"code": 0, "data": data, "msg": ""}
    finally:
        conn.close()


@router.get("/settings/data-path")
def settings_data_path():
    return {"code": 0, "data": {"path": str(get_data_root())}, "msg": ""}


@router.post("/library/reprocess")
def library_reprocess(body: LibraryReprocessRequest | None = None):
    from core.images import refresh_library_framing

    pose = True if body is None else body.pose
    color = False if body is None else body.color
    if pose:
        refresh_library_framing()
    return {"code": 0, "data": enqueue_library(pose=pose, color=color), "msg": ""}


@router.put("/settings")
def settings_put(body: SettingsPut):
    conn = connect()
    try:
        payload = body.model_dump(exclude_none=True)
        for key, value in payload.items():
            set_setting(conn, key, str(value))
        conn.commit()
        rows = conn.execute("SELECT key, value FROM settings").fetchall()
        data = {r["key"]: r["value"] for r in rows}
        data["data_path"] = str(get_data_root())
        return {"code": 0, "data": data, "msg": ""}
    finally:
        conn.close()


@router.post("/backup/create")
def backup_create(body: BackupCreate | None = None):
    note = body.note if body else None
    try:
        data = create_backup(note)
        return {"code": 0, "data": data, "msg": ""}
    except Exception as exc:  # noqa: BLE001
        return {"code": 1, "data": None, "msg": f"备份失败：{exc}"}


@router.get("/backup/list")
def backup_list():
    return {"code": 0, "data": list_backups(), "msg": ""}


@router.post("/backup/restore/{backup_id}")
def backup_restore(backup_id: int):
    try:
        data = restore_backup(backup_id)
        return {"code": 0, "data": data, "msg": ""}
    except Exception as exc:  # noqa: BLE001
        return {"code": 1, "data": None, "msg": f"恢复失败：{exc}"}

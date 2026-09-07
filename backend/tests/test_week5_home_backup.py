from __future__ import annotations

from pathlib import Path

from tests.conftest import import_ok


def test_home_empty_state(client):
    data = client.get("/api/v1/home/summary").json()["data"]
    assert data["last_board"] is None
    assert data["recent_images"] == []
    assert data["recent_boards"] == []
    assert data["counts"]["images"] == 0
    tags = client.get("/api/v1/tags").json()["data"]
    assert {t["name"] for t in tags} >= {"人物", "场景"}
    assert data["counts"]["tags"] == len(tags)
    assert data["counts"]["boards"] == 0
    assert data["failed_count"] == 0
    assert data["backup_overdue"] is False


def test_home_with_data_and_last_board(client, sample_files):
    imported = import_ok(client, [sample_files["blue"], sample_files["orange"]])
    tag_id = client.post("/api/v1/tags", json={"name": "练习"}).json()["data"]["id"]
    client.put(
        f"/api/v1/images/{imported['imported'][0]['id']}/tags",
        json={"tag_ids": [tag_id]},
    )
    board = client.post("/api/v1/boards", json={"name": "上次画板"}).json()["data"]
    client.post(
        f"/api/v1/boards/{board['id']}/items",
        json={"image_id": imported["imported"][0]["id"], "x": 0, "y": 0, "width": 200, "height": 200},
    )
    opened = client.get(f"/api/v1/boards/{board['id']}").json()["data"]
    assert opened["id"] == board["id"]
    home = client.get("/api/v1/home/summary").json()["data"]
    assert home["last_board"]["id"] == board["id"]
    assert home["last_board"]["item_count"] == 1
    assert home["counts"]["images"] == 2
    tags = client.get("/api/v1/tags").json()["data"]
    assert any(t["name"] == "练习" for t in tags)
    assert home["counts"]["tags"] == len(tags)
    assert home["counts"]["boards"] == 1
    assert len(home["recent_images"]) == 2
    assert home["recent_boards"][0]["name"] == "上次画板"


def test_settings_shows_data_path(client, data_dir):
    res = client.get("/api/v1/settings").json()["data"]
    assert Path(res["data_path"]) == data_dir
    assert (data_dir / "poseboard.db").exists()
    assert (data_dir / "originals").is_dir()


def test_backup_and_restore_roundtrip(client, sample_files):
    imported = import_ok(client, [sample_files["blue"], sample_files["orange"]])
    ids = [x["id"] for x in imported["imported"]]
    tag_id = client.post("/api/v1/tags", json={"name": "侧踢"}).json()["data"]["id"]
    client.put(f"/api/v1/images/{ids[0]}/tags", json={"tag_ids": [tag_id]})
    board_id = client.post("/api/v1/boards", json={"name": "恢复验证"}).json()["data"]["id"]
    client.put(
        f"/api/v1/boards/{board_id}/layout",
        json={
            "pan_x": 9,
            "pan_y": 3,
            "zoom": 1.5,
            "items": [
                {"image_id": ids[0], "x": 100, "y": 80, "width": 220, "height": 220, "z_index": 1},
                {"image_id": ids[1], "x": 400, "y": 80, "width": 220, "height": 220, "z_index": 2},
            ],
        },
    )
    backup = client.post("/api/v1/backup/create", json={"note": "验收快照"})
    assert backup.json()["code"] == 0
    backup_id = backup.json()["data"]["id"]
    listed = client.get("/api/v1/backup/list").json()["data"]
    assert any(b["id"] == backup_id and b["status"] == "success" for b in listed)
    assert backup.json()["data"]["created_at"]

    extra = import_ok(client, [sample_files["landscape"]])
    assert extra["imported_count"] == 1
    client.patch(f"/api/v1/boards/{board_id}", json={"name": "已被改过"})

    restored = client.post(f"/api/v1/backup/restore/{backup_id}")
    assert restored.json()["code"] == 0
    assert restored.json()["data"]["safety_backup_id"]

    images = client.get("/api/v1/images").json()["data"]
    assert images["total"] == 2
    tags = client.get("/api/v1/tags").json()["data"]
    assert any(t["name"] == "侧踢" for t in tags)
    boards = client.get("/api/v1/boards").json()["data"]
    target = next(b for b in boards if b["name"] == "恢复验证")
    detail = client.get(f"/api/v1/boards/{target['id']}").json()["data"]
    assert detail["zoom"] == 1.5
    assert detail["pan_x"] == 9
    assert detail["item_count"] == 2


def test_failed_backup_not_listed_as_success(client, monkeypatch, data_dir):
    from core import backup as backup_mod

    def boom(*args, **kwargs):
        raise RuntimeError("disk full")

    monkeypatch.setattr(backup_mod.zipfile, "ZipFile", boom)
    res = client.post("/api/v1/backup/create", json={"note": "会失败"})
    assert res.json()["code"] != 0
    listed = client.get("/api/v1/backup/list").json()["data"]
    assert listed == []
    leftovers = list((data_dir / "backups").glob("*"))
    assert not any(p.name.startswith("backup_") and p.suffix == ".zip" for p in leftovers)

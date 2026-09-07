from __future__ import annotations

from tests.conftest import import_ok


def test_create_board_add_three_cards_and_persist_layout(client, sample_files):
    imported = import_ok(client, [sample_files["blue"], sample_files["orange"], sample_files["landscape"]])
    ids = [x["id"] for x in imported["imported"]]
    board = client.post("/api/v1/boards", json={"name": "配色对照"}).json()["data"]
    board_id = board["id"]
    items = []
    for i, image_id in enumerate(ids):
        items.append(
            {
                "image_id": image_id,
                "x": 40 + i * 280,
                "y": 60,
                "width": 240,
                "height": 240,
                "z_index": i,
            }
        )
    saved = client.put(
        f"/api/v1/boards/{board_id}/layout",
        json={"pan_x": 12, "pan_y": -8, "zoom": 1.25, "items": items},
    )
    assert saved.json()["code"] == 0
    data = saved.json()["data"]
    assert data["item_count"] == 3
    assert data["pan_x"] == 12
    assert data["zoom"] == 1.25

    again = client.get(f"/api/v1/boards/{board_id}").json()["data"]
    assert again["item_count"] == 3
    assert again["pan_x"] == 12
    assert again["pan_y"] == -8
    assert again["zoom"] == 1.25
    xs = sorted(item["x"] for item in again["items"])
    assert xs == sorted(40 + i * 280 for i in range(3))


def test_delete_card_keeps_library_image(client, sample_files):
    image_id = import_ok(client, [sample_files["blue"]])["imported"][0]["id"]
    board_id = client.post("/api/v1/boards", json={"name": "A"}).json()["data"]["id"]
    item = client.post(
        f"/api/v1/boards/{board_id}/items",
        json={"image_id": image_id, "x": 10, "y": 10, "width": 200, "height": 200},
    ).json()["data"]
    client.delete(f"/api/v1/board-items/{item['id']}")
    board = client.get(f"/api/v1/boards/{board_id}").json()["data"]
    assert board["item_count"] == 0
    assert client.get("/api/v1/images").json()["data"]["total"] == 1


def test_delete_board_keeps_library_images(client, sample_files):
    image_id = import_ok(client, [sample_files["orange"]])["imported"][0]["id"]
    board_id = client.post("/api/v1/boards", json={"name": "临时"}).json()["data"]["id"]
    client.post(
        f"/api/v1/boards/{board_id}/items",
        json={"image_id": image_id, "x": 0, "y": 0, "width": 200, "height": 200},
    )
    client.delete(f"/api/v1/boards/{board_id}")
    assert client.get("/api/v1/boards").json()["data"] == []
    assert client.get("/api/v1/images").json()["data"]["total"] == 1


def test_delete_image_removes_board_cards_after_confirm(client, sample_files):
    image_id = import_ok(client, [sample_files["landscape"]])["imported"][0]["id"]
    board_id = client.post("/api/v1/boards", json={"name": "引用"}).json()["data"]["id"]
    client.post(
        f"/api/v1/boards/{board_id}/items",
        json={"image_id": image_id, "x": 0, "y": 0, "width": 200, "height": 200},
    )
    refs = client.get(f"/api/v1/images/{image_id}/board-refs").json()["data"]
    assert refs["count"] == 1
    client.delete(f"/api/v1/images/{image_id}")
    board = client.get(f"/api/v1/boards/{board_id}").json()["data"]
    assert board["item_count"] == 0
    assert client.get("/api/v1/images").json()["data"]["total"] == 0


def test_same_image_can_appear_twice_on_board(client, sample_files):
    image_id = import_ok(client, [sample_files["blue"]])["imported"][0]["id"]
    board_id = client.post("/api/v1/boards", json={"name": "重复"}).json()["data"]["id"]
    a = client.post(
        f"/api/v1/boards/{board_id}/items",
        json={"image_id": image_id, "x": 0, "y": 0, "width": 180, "height": 180},
    ).json()["data"]
    b = client.post(
        f"/api/v1/boards/{board_id}/items",
        json={"image_id": image_id, "x": 400, "y": 20, "width": 180, "height": 180},
    ).json()["data"]
    assert a["id"] != b["id"]
    board = client.get(f"/api/v1/boards/{board_id}").json()["data"]
    assert board["item_count"] == 2
    client.put(
        f"/api/v1/boards/{board_id}/layout",
        json={
            "pan_x": 0,
            "pan_y": 0,
            "zoom": 1,
            "items": [
                {"image_id": image_id, "x": 5, "y": 5, "width": 180, "height": 180, "z_index": 0},
                {"image_id": image_id, "x": 500, "y": 40, "width": 180, "height": 180, "z_index": 1},
            ],
        },
    )
    again = client.get(f"/api/v1/boards/{board_id}").json()["data"]
    xs = sorted(item["x"] for item in again["items"])
    assert xs == [5, 500]


def test_library_add_goes_to_tray_not_canvas(client, sample_files):
    imported = import_ok(client, [sample_files["blue"], sample_files["orange"]])
    ids = [x["id"] for x in imported["imported"]]
    board_id = client.post("/api/v1/boards", json={"name": "托盘"}).json()["data"]["id"]
    added = client.post(f"/api/v1/boards/{board_id}/tray", json={"image_ids": ids})
    assert added.json()["code"] == 0
    board = added.json()["data"]
    assert board["item_count"] == 0
    assert [t["id"] for t in board["tray"]] == ids
    listed = client.get("/api/v1/boards").json()["data"][0]
    assert listed["tray_count"] == 2
    again = client.post(f"/api/v1/boards/{board_id}/tray", json={"image_ids": [ids[0]]}).json()["data"]
    assert len(again["tray"]) == 2
    removed = client.delete(f"/api/v1/boards/{board_id}/tray/{ids[0]}").json()["data"]
    assert [t["id"] for t in removed["tray"]] == [ids[1]]
    client.put(
        f"/api/v1/boards/{board_id}/layout",
        json={
            "pan_x": 0,
            "pan_y": 0,
            "zoom": 1,
            "items": [{"image_id": ids[1], "x": 40, "y": 40, "width": 200, "height": 200, "z_index": 0}],
        },
    )
    placed = client.get(f"/api/v1/boards/{board_id}").json()["data"]
    assert placed["item_count"] == 1
    assert [t["id"] for t in placed["tray"]] == [ids[1]]


def test_search_result_can_join_board(client, sample_files):
    image_id = import_ok(client, [sample_files["blue"]])["imported"][0]["id"]
    from tests.pose_fixtures import set_pose_landmarks, standing_pose

    set_pose_landmarks(image_id, standing_pose())
    board_id = client.post("/api/v1/boards", json={"name": "检索加入"}).json()["data"]["id"]
    search = client.post("/api/v1/search/by-pose", json={"image_id": image_id}).json()["data"]["items"]
    assert search[0]["id"] == image_id
    client.post(
        f"/api/v1/boards/{board_id}/items",
        json={"image_id": search[0]["id"], "x": 30, "y": 30, "width": 200, "height": 200},
    )
    board = client.get(f"/api/v1/boards/{board_id}").json()["data"]
    assert board["item_count"] == 1
    assert board["items"][0]["image_id"] == image_id
    assert board["tray"][0]["id"] == image_id


def test_canvas_images_are_mirrored_in_tray(client, sample_files):
    image_id = import_ok(client, [sample_files["orange"]])["imported"][0]["id"]
    board_id = client.post("/api/v1/boards", json={"name": "同步"}).json()["data"]["id"]
    client.post(
        f"/api/v1/boards/{board_id}/items",
        json={"image_id": image_id, "x": 20, "y": 20, "width": 180, "height": 180},
    )
    board = client.get(f"/api/v1/boards/{board_id}").json()["data"]
    assert board["item_count"] == 1
    assert [t["id"] for t in board["tray"]] == [image_id]
    gone = client.delete(f"/api/v1/boards/{board_id}/tray/{image_id}").json()["data"]
    assert gone["item_count"] == 0
    assert gone["tray"] == []


def test_board_preview_is_full_canvas(client, sample_files, data_dir):
    from io import BytesIO
    from PIL import Image
    import base64

    image_id = import_ok(client, [sample_files["blue"]])["imported"][0]["id"]
    board_id = client.post("/api/v1/boards", json={"name": "预览"}).json()["data"]["id"]
    listed = client.get("/api/v1/boards").json()["data"][0]
    assert listed["preview_url"] is None
    buf = BytesIO()
    Image.new("RGB", (320, 200), (40, 80, 180)).save(buf, "JPEG")
    data_url = "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode("ascii")
    saved = client.post(f"/api/v1/boards/{board_id}/preview", json={"image": data_url})
    assert saved.json()["code"] == 0
    board = saved.json()["data"]
    assert board["preview_url"].startswith(f"/media/board-previews/{board_id}")
    media = client.get(board["preview_url"].split("?")[0])
    assert media.status_code == 200
    assert (data_dir / "board_previews" / f"{board_id}.jpg").is_file()
    client.post(
        f"/api/v1/boards/{board_id}/items",
        json={"image_id": image_id, "x": 10, "y": 10, "width": 180, "height": 180},
    )
    client.delete(f"/api/v1/boards/{board_id}")
    assert not (data_dir / "board_previews" / f"{board_id}.jpg").exists()

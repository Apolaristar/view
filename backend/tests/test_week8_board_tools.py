from __future__ import annotations

from tests.conftest import import_ok


def test_board_item_rotation_and_crop_persist(client, sample_files):
    image_id = import_ok(client, [sample_files["blue"]])["imported"][0]["id"]
    board_id = client.post("/api/v1/boards", json={"name": "变换"}).json()["data"]["id"]
    saved = client.put(
        f"/api/v1/boards/{board_id}/layout",
        json={
            "pan_x": 0,
            "pan_y": 0,
            "zoom": 1,
            "items": [
                {
                    "image_id": image_id,
                    "x": 20,
                    "y": 30,
                    "width": 200,
                    "height": 160,
                    "z_index": 0,
                    "rotation": 90,
                    "crop_x": 0.1,
                    "crop_y": 0.2,
                    "crop_w": 0.5,
                    "crop_h": 0.4,
                }
            ],
        },
    )
    assert saved.json()["code"] == 0
    item = saved.json()["data"]["items"][0]
    assert item["rotation"] == 90
    assert item["crop_x"] == 0.1
    assert item["crop_y"] == 0.2
    assert item["crop_w"] == 0.5
    assert item["crop_h"] == 0.4
    again = client.get(f"/api/v1/boards/{board_id}").json()["data"]["items"][0]
    assert again["rotation"] == 90
    assert again["crop_w"] == 0.5
    assert again["image"]["original_url"].startswith("/media/originals/")

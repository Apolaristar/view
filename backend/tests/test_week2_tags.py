from __future__ import annotations

from tests.conftest import import_ok


def test_create_rename_delete_tag_keeps_images(client, sample_files):
    imported = import_ok(client, [sample_files["person_a"], sample_files["person_b"]])
    ids = [x["id"] for x in imported["imported"]]
    created = client.post("/api/v1/tags", json={"name": "侧踢", "color": "#ff6600"})
    assert created.json()["code"] == 0
    tag_id = created.json()["data"]["id"]

    for image_id in ids:
        res = client.put(f"/api/v1/images/{image_id}/tags", json={"tag_ids": [tag_id]})
        assert res.json()["code"] == 0
        names = [t["name"] for t in res.json()["data"]["tags"]]
        assert "侧踢" in names

    listed = client.get("/api/v1/tags").json()["data"]
    row = next(t for t in listed if t["id"] == tag_id)
    assert row["image_count"] == 2

    filtered = client.get(f"/api/v1/images?tag_ids={tag_id}").json()["data"]
    assert filtered["total"] == 2

    renamed = client.patch(f"/api/v1/tags/{tag_id}", json={"name": "侧踢动作"})
    assert renamed.json()["data"]["name"] == "侧踢动作"
    filtered2 = client.get(f"/api/v1/images?tag_ids={tag_id}").json()["data"]
    assert filtered2["total"] == 2
    assert filtered2["items"][0]["tags"][0]["name"] == "侧踢动作"

    deleted = client.delete(f"/api/v1/tags/{tag_id}")
    assert deleted.json()["code"] == 0
    images = client.get("/api/v1/images").json()["data"]
    assert images["total"] == 2
    assert all(item["tags"] == [] for item in images["items"])


def test_duplicate_tag_name_rejected(client):
    first = client.post("/api/v1/tags", json={"name": "室内光"})
    assert first.json()["code"] == 0
    second = client.post("/api/v1/tags", json={"name": "室内光"})
    assert second.json()["code"] != 0


def test_batch_add_tag(client, sample_files):
    imported = import_ok(client, [sample_files["blue"], sample_files["orange"], sample_files["landscape"]])
    ids = [x["id"] for x in imported["imported"]]
    tag_id = client.post("/api/v1/tags", json={"name": "夜景"}).json()["data"]["id"]
    res = client.post(
        "/api/v1/images/batch-tags",
        json={"image_ids": ids[:2], "add": [tag_id], "remove": []},
    )
    assert res.json()["code"] == 0
    tagged = client.get(f"/api/v1/images?tag_ids={tag_id}").json()["data"]
    assert tagged["total"] == 2
    for item in tagged["items"]:
        assert any(t["id"] == tag_id for t in item["tags"])


def test_camera_angle_filter(client, sample_files):
    imported = import_ok(client, [sample_files["person_a"], sample_files["person_b"]])
    a, b = imported["imported"][0]["id"], imported["imported"][1]["id"]
    client.patch(f"/api/v1/images/{a}", json={"camera_angle": "side", "notes": "侧面参考"})
    client.patch(f"/api/v1/images/{b}", json={"camera_angle": "frontal"})
    side = client.get("/api/v1/images?angle=side").json()["data"]
    assert side["total"] == 1
    assert side["items"][0]["id"] == a
    assert side["items"][0]["notes"] == "侧面参考"


def test_delete_image_removes_files(client, sample_files, data_dir):
    imported = import_ok(client, [sample_files["landscape"]])
    image_id = imported["imported"][0]["id"]
    detail = client.get(f"/api/v1/images/{image_id}").json()["data"]
    orig = data_dir / "originals" / detail["original_path"]
    thumb = data_dir / "thumbnails" / detail["thumbnail_path"]
    assert orig.exists()
    client.delete(f"/api/v1/images/{image_id}")
    assert client.get("/api/v1/images").json()["data"]["total"] == 0
    assert not orig.exists()
    assert not thumb.exists()


def test_reorder_and_rename_tags(client):
    tags = client.get("/api/v1/tags").json()["data"]
    cats = [t for t in tags if t["kind"] == "category"]
    names = [t["name"] for t in cats]
    reversed_ids = [t["id"] for t in reversed(cats)]
    res = client.put("/api/v1/tags/reorder", json={"ids": reversed_ids})
    assert res.json()["code"] == 0
    again = [t["name"] for t in client.get("/api/v1/tags").json()["data"] if t["kind"] == "category"]
    assert again == list(reversed(names))
    first = cats[0]
    patched = client.patch(f"/api/v1/tags/{first['id']}", json={"name": first["name"] + "改"}).json()["data"]
    assert patched["name"] == first["name"] + "改"

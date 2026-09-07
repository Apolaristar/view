from __future__ import annotations

from core.color_extractor import extract_from_file, family_from_rgb, matches_family_filter
from core.queue import process_image
from tests.conftest import import_ok


def test_navy_and_sky_count_as_blue():
    assert family_from_rgb(0, 31, 91) == "blue"
    assert family_from_rgb(135, 206, 235) == "blue"
    assert family_from_rgb(0, 40, 220) == "blue"


def test_red_filter_uses_primary_only_not_skin():
    image = {
        "primary_family": "blue",
        "palette": [
            {"family": "blue", "ratio": 0.72},
            {"family": "pink", "ratio": 0.16},
            {"family": "red", "ratio": 0.08},
        ],
    }
    assert matches_family_filter(image, {"blue"})
    assert not matches_family_filter(image, {"red"})
    assert not matches_family_filter(image, {"pink"})


def test_blue_filter_matches_similar_blues(client, sample_files):
    imported = import_ok(client, [sample_files["blue"], sample_files["navy"], sample_files["sky"], sample_files["orange"]])
    for item in imported["imported"]:
        process_image(item["id"])
    blue = client.get("/api/v1/images?families=blue").json()["data"]
    orange = client.get("/api/v1/images?families=orange").json()["data"]
    assert blue["total"] == 3
    assert orange["total"] == 1
    assert all(item["primary_family"] in {"blue", "cyan"} for item in blue["items"])
    red = client.get("/api/v1/images?families=red").json()["data"]
    assert red["total"] == 0


def test_solid_color_has_empty_secondary(sample_files):
    result = extract_from_file(sample_files["blue"])
    assert result["primary_family"] == "blue"
    assert result["secondary_family"] is None


def test_two_color_image_has_secondary(sample_files):
    result = extract_from_file(sample_files["blue_orange"])
    assert result["primary_family"] in {"blue", "orange"}
    assert result["secondary_family"] in {"blue", "orange"}
    assert result["secondary_family"] != result["primary_family"]


def test_secondary_filter_and_manual_edit(client, sample_files):
    imported = import_ok(client, [sample_files["blue_orange"], sample_files["blue"]])
    for item in imported["imported"]:
        process_image(item["id"])
    images = client.get("/api/v1/images").json()["data"]["items"]
    duo = next(i for i in images if i["secondary_family"])
    solid = next(i for i in images if i["id"] != duo["id"])
    assert solid["secondary_family"] is None
    by_sec = client.get(f"/api/v1/images?secondary={duo['secondary_family']}").json()["data"]
    assert by_sec["total"] == 1
    assert by_sec["items"][0]["id"] == duo["id"]
    patched = client.patch(
        f"/api/v1/images/{solid['id']}",
        json={"primary_family": "green", "secondary_family": "red", "extra_families": ["purple"]},
    ).json()["data"]
    assert patched["primary_family"] == "green"
    assert patched["secondary_family"] == "red"
    assert "purple" in patched["extra_families"]
    extras = client.get("/api/v1/images?secondary=purple").json()["data"]
    assert extras["total"] == 1
    assert extras["items"][0]["id"] == solid["id"]
    process_image(solid["id"])
    kept = client.get(f"/api/v1/images/{solid['id']}").json()["data"]
    assert kept["primary_family"] == "green"
    assert kept["secondary_family"] == "red"
    client.post(f"/api/v1/images/{solid['id']}/reprocess", json={"pose": False, "color": True})
    reset = client.get(f"/api/v1/images/{solid['id']}").json()["data"]
    assert reset["primary_family"] == "blue"
    assert reset["secondary_family"] is None


def test_default_taxonomy_seeded(client):
    tags = client.get("/api/v1/tags").json()["data"]
    names = {t["name"] for t in tags}
    assert {"人物", "场景", "道具", "正面", "侧面", "室内"}.issubset(names)
    person = next(t for t in tags if t["name"] == "人物")
    front = next(t for t in tags if t["name"] == "正面")
    assert person["kind"] == "category"
    assert front["kind"] == "facet"
    assert front["parent_id"] == person["id"]


def test_category_filter_includes_child_tags(client, sample_files):
    imported = import_ok(client, [sample_files["person_a"], sample_files["person_b"]])
    a, b = imported["imported"][0]["id"], imported["imported"][1]["id"]
    tags = client.get("/api/v1/tags").json()["data"]
    person = next(t for t in tags if t["name"] == "人物")
    front = next(t for t in tags if t["name"] == "正面")
    side = next(t for t in tags if t["name"] == "侧面")
    client.put(f"/api/v1/images/{a}/tags", json={"tag_ids": [front["id"]]})
    client.put(f"/api/v1/images/{b}/tags", json={"tag_ids": [side["id"]]})
    by_person = client.get(f"/api/v1/images?tag_ids={person['id']}").json()["data"]
    by_front = client.get(f"/api/v1/images?tag_ids={front['id']}").json()["data"]
    assert by_person["total"] == 2
    assert by_front["total"] == 1
    tagged = client.get(f"/api/v1/images/{a}").json()["data"]
    names = {t["name"] for t in tagged["tags"]}
    assert {"人物", "正面"}.issubset(names)


def test_create_custom_and_child_tag(client):
    custom = client.post("/api/v1/tags", json={"name": "参考构图", "kind": "custom"})
    assert custom.json()["code"] == 0
    assert custom.json()["data"]["kind"] == "custom"
    tags = client.get("/api/v1/tags").json()["data"]
    person = next(t for t in tags if t["name"] == "人物")
    child = client.post("/api/v1/tags", json={"name": "3/4侧面", "parent_id": person["id"], "kind": "facet"})
    assert child.json()["code"] == 0
    assert child.json()["data"]["parent_id"] == person["id"]


def test_media_thumbnail_without_query_lock(client, sample_files):
    imported = import_ok(client, [sample_files["blue"]])
    uid = imported["imported"][0]["uid"]
    res = client.get(f"/media/thumbnails/{uid}")
    assert res.status_code == 200
    assert res.headers["content-type"].startswith("image/")
    assert res.content

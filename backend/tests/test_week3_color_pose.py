from __future__ import annotations

from core.color_extractor import extract_from_file, family_from_rgb, matches_family_filter
from core.pose_extractor import extract_pose, pose_similarity_distance
from core.queue import process_image
from tests.conftest import import_ok
from tests.pose_fixtures import kick_pose, set_pose_landmarks, sit_pose, standing_pose


def test_family_from_known_rgb():
    assert family_from_rgb(0, 40, 220) == "blue"
    assert family_from_rgb(255, 140, 0) == "orange"
    assert family_from_rgb(10, 10, 10) == "black"
    assert family_from_rgb(250, 250, 250) == "white"


def test_extract_palette_solid_blue(sample_files):
    result = extract_from_file(sample_files["blue"])
    assert result["palette"]
    assert len(result["palette"]) <= 5
    families = [c["family"] for c in result["palette"][:3]]
    assert "blue" in families
    assert result["primary_family"] == "blue"


def test_color_extraction_and_family_filter(client, sample_files):
    imported = import_ok(client, [sample_files["blue"], sample_files["orange"], sample_files["landscape"]])
    for item in imported["imported"]:
        process_image(item["id"])
    blue = client.get("/api/v1/images?families=blue").json()["data"]
    orange = client.get("/api/v1/images?families=orange").json()["data"]
    assert blue["total"] >= 1
    assert all(matches_family_filter(item, {"blue"}) for item in blue["items"])
    assert orange["total"] >= 1
    assert all(matches_family_filter(item, {"orange"}) for item in orange["items"])
    blue_ids = {i["id"] for i in blue["items"]}
    orange_ids = {i["id"] for i in orange["items"]}
    assert blue_ids.isdisjoint(orange_ids)


def test_tag_and_color_combined_filter(client, sample_files):
    imported = import_ok(client, [sample_files["blue"], sample_files["orange"]])
    for item in imported["imported"]:
        process_image(item["id"])
    tag_id = client.post("/api/v1/tags", json={"name": "冷色"}).json()["data"]["id"]
    images = client.get("/api/v1/images").json()["data"]["items"]
    blue_item = next(i for i in images if i["primary_family"] == "blue")
    client.put(f"/api/v1/images/{blue_item['id']}/tags", json={"tag_ids": [tag_id]})
    both = client.get(f"/api/v1/images?tag_ids={tag_id}&families=blue").json()["data"]
    assert both["total"] == 1
    assert both["items"][0]["id"] == blue_item["id"]


def test_palette_visible_on_detail_after_process(client, sample_files):
    image_id = import_ok(client, [sample_files["orange"]])["imported"][0]["id"]
    pending = client.get(f"/api/v1/images/{image_id}").json()["data"]
    assert pending["color_status"] == "pending"
    process_image(image_id)
    done = client.get(f"/api/v1/images/{image_id}").json()["data"]
    assert done["color_status"] == "ok"
    assert 1 <= len(done["palette"]) <= 5


def test_landscape_pose_status_none(client, sample_files):
    image_id = import_ok(client, [sample_files["landscape"]])["imported"][0]["id"]
    process_image(image_id)
    detail = client.get(f"/api/v1/images/{image_id}").json()["data"]
    assert detail["pose_status"] == "none"
    assert detail["color_status"] == "ok"


def test_reprocess_endpoint(client, sample_files):
    image_id = import_ok(client, [sample_files["blue"]])["imported"][0]["id"]
    res = client.post(f"/api/v1/images/{image_id}/reprocess", json={"pose": True, "color": True})
    assert res.json()["code"] == 0
    assert res.json()["data"]["color_status"] == "ok"


def test_pose_search_self_first_and_similar_ahead(client, sample_files):
    imported = import_ok(
        client,
        [sample_files["person_a"], sample_files["person_b"], sample_files["landscape"], sample_files["blue"], sample_files["orange"]],
    )
    ids = [x["id"] for x in imported["imported"]]
    poses = [standing_pose(), standing_pose(), kick_pose(), sit_pose(), kick_pose()]
    for image_id, pose in zip(ids, poses):
        set_pose_landmarks(image_id, pose)
    query_id = ids[0]
    res = client.post("/api/v1/search/by-pose", json={"image_id": query_id})
    assert res.json()["code"] == 0
    items = res.json()["data"]["items"]
    assert len(items) <= 20
    assert items[0]["id"] == query_id
    ranked_ids = [i["id"] for i in items]
    # person_b has the same standing pose and should beat kick/sit
    assert ranked_ids.index(ids[1]) < ranked_ids.index(ids[2])
    assert ranked_ids.index(ids[1]) < ranked_ids.index(ids[3])


def test_pose_search_no_body_on_upload(client, sample_files):
    files = {"file": ("landscape.png", sample_files["landscape"].read_bytes(), "image/png")}
    res = client.post("/api/v1/search/by-pose", files=files)
    assert res.json()["code"] != 0
    assert "人体" in res.json()["msg"]


def test_pose_search_empty_library(client):
    res = client.post("/api/v1/search/by-pose", json={})
    assert res.status_code == 200
    body = res.json()
    assert body["code"] == 0
    assert body["data"]["items"] == []
    assert body["data"].get("empty") is True


def test_extract_pose_on_solid_color_is_none(sample_files):
    status, landmarks = extract_pose(sample_files["landscape"])
    assert status == "none"
    assert landmarks is None


def test_identical_landmarks_distance_zero():
    pose = standing_pose()
    assert pose_similarity_distance(pose, pose) == 0
    # mirrored standing is still closer to standing than to a kick
    assert pose_similarity_distance(pose, standing_pose()) < pose_similarity_distance(pose, kick_pose())


def test_face_landmarks_do_not_change_distance():
    a = standing_pose()
    b = standing_pose()
    b[2] = {**b[2], "x": 0.91, "y": 0.04}
    b[19] = {**b[19], "x": 0.12, "y": 0.88}
    assert pose_similarity_distance(a, b) == 0

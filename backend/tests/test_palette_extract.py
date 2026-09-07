from __future__ import annotations

from PIL import Image

from core.color_extractor import extract_from_file, extract_palette
from tests.conftest import import_ok


def save_stripes(path, colors, size=(320, 80)):
    path.parent.mkdir(parents=True, exist_ok=True)
    im = Image.new("RGB", size)
    band = max(1, size[0] // len(colors))
    for x in range(size[0]):
        color = colors[min(x // band, len(colors) - 1)]
        for y in range(size[1]):
            im.putpixel((x, y), color)
    im.save(path, "PNG")
    return path


def test_default_extract_still_caps_at_five(sample_files):
    result = extract_from_file(sample_files["blue_orange"])
    assert 1 <= len(result["palette"]) <= 5


def test_extract_palette_can_return_eight(tmp_path):
    colors = [
        (220, 40, 40),
        (230, 140, 20),
        (240, 210, 40),
        (40, 170, 70),
        (20, 180, 180),
        (30, 70, 210),
        (130, 50, 180),
        (40, 40, 40),
    ]
    path = save_stripes(tmp_path / "stripes.png", colors)
    palette = extract_palette(path, k=8, min_ratio=0.0, limit=8)
    assert 6 <= len(palette) <= 8
    hexes = {c["hex"] for c in palette}
    assert len(hexes) >= 6


def test_palette_extract_api_preview_and_apply(client, tmp_path, sample_files):
    colors = [
        (220, 40, 40),
        (230, 140, 20),
        (240, 210, 40),
        (40, 170, 70),
        (20, 180, 180),
        (30, 70, 210),
        (130, 50, 180),
        (40, 40, 40),
    ]
    path = save_stripes(tmp_path / "inbox" / "stripes.png", colors)
    image_id = import_ok(client, [path])["imported"][0]["id"]
    preview = client.post(f"/api/v1/images/{image_id}/palette", json={"k": 8, "apply": False}).json()
    assert preview["code"] == 0
    assert preview["data"]["applied"] is False
    assert preview["data"]["image"] is None
    assert 2 <= len(preview["data"]["palette"]) <= 8
    before = client.get(f"/api/v1/images/{image_id}").json()["data"]
    assert before["palette"] != preview["data"]["palette"] or before["color_status"] == "pending"
    applied = client.post(f"/api/v1/images/{image_id}/palette", json={"k": 8, "apply": True}).json()
    assert applied["code"] == 0
    assert applied["data"]["applied"] is True
    assert applied["data"]["image"]["id"] == image_id
    detail = client.get(f"/api/v1/images/{image_id}").json()["data"]
    assert detail["palette"] == applied["data"]["palette"]
    assert detail["local_path"]
    assert 2 <= len(detail["palette"]) <= 8

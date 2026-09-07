from __future__ import annotations

import os
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from PIL import Image


@pytest.fixture()
def data_dir(tmp_path, monkeypatch) -> Path:
    monkeypatch.setenv("POSEBOARD_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("POSEBOARD_DISABLE_WORKER", "1")
    return tmp_path


@pytest.fixture()
def client(data_dir):
    from main import create_app

    with TestClient(create_app()) as c:
        yield c


def save_split_image(path: Path, left: tuple[int, int, int], right: tuple[int, int, int], size=(160, 80)) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    im = Image.new("RGB", size)
    mid = size[0] // 2
    for x in range(size[0]):
        color = left if x < mid else right
        for y in range(size[1]):
            im.putpixel((x, y), color)
    im.save(path, "PNG")
    return path


def save_color_image(path: Path, color: tuple[int, int, int], size=(96, 96)) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.new("RGB", size, color).save(path, "PNG")
    return path


@pytest.fixture()
def sample_files(tmp_path) -> dict[str, Path]:
    folder = tmp_path / "inbox"
    folder.mkdir()
    files = {
        "blue": save_color_image(folder / "blue_scene.png", (0, 40, 220)),
        "navy": save_color_image(folder / "navy_scene.png", (0, 31, 91)),
        "sky": save_color_image(folder / "sky_scene.png", (135, 206, 235)),
        "orange": save_color_image(folder / "orange_scene.png", (255, 140, 0)),
        "landscape": save_color_image(folder / "landscape.png", (30, 160, 50)),
        "person_a": save_color_image(folder / "person_a.png", (200, 160, 140), size=(120, 180)),
        "person_b": save_color_image(folder / "person_b.png", (190, 150, 130), size=(120, 180)),
        "blue_orange": save_split_image(folder / "blue_orange.png", (0, 40, 220), (255, 140, 0)),
    }
    return files


def import_ok(client: TestClient, paths: list[Path] | list[str]):
    payload = {"paths": [str(p) for p in paths]}
    res = client.post("/api/v1/images/import", json=payload)
    assert res.status_code == 200
    body = res.json()
    assert body["code"] == 0
    return body["data"]

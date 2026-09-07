from __future__ import annotations

from pathlib import Path

from PIL import Image

from tests.conftest import import_ok, save_color_image


def test_health(client):
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json()["status"] == "ok"


def test_data_path_uses_env_not_install_dir(client, data_dir):
    res = client.get("/api/v1/settings/data-path")
    assert res.status_code == 200
    path = Path(res.json()["data"]["path"])
    assert path == data_dir
    assert (path / "originals").is_dir()
    assert (path / "thumbnails").is_dir()
    assert (path / "backups").is_dir()
    assert (path / "poseboard.db").is_file()


def test_import_single_creates_original_and_thumbnail(client, sample_files, data_dir):
    data = import_ok(client, [sample_files["landscape"]])
    assert data["imported_count"] == 1
    assert data["skipped_count"] == 0
    image = client.get("/api/v1/images").json()["data"]["items"][0]
    orig = data_dir / "originals" / image["original_path"]
    thumb = data_dir / "thumbnails" / image["thumbnail_path"]
    assert orig.is_file()
    assert thumb.is_file()
    assert image["width"] == 96
    assert image["height"] == 96
    media = client.get(image["thumbnail_url"])
    assert media.status_code == 200


def test_import_duplicate_hash_does_not_create_second_row(client, sample_files):
    first = import_ok(client, [sample_files["landscape"]])
    dup = sample_files["landscape"].parent / "landscape_copy.png"
    dup.write_bytes(sample_files["landscape"].read_bytes())
    second = import_ok(client, [dup])
    assert first["imported_count"] == 1
    assert second["imported_count"] == 0
    assert second["skipped_count"] == 1
    assert second["skipped"][0]["reason"] == "already_exists"
    listed = client.get("/api/v1/images").json()["data"]
    assert listed["total"] == 1


def test_import_folder_imports_all_images(client, sample_files):
    folder = sample_files["blue"].parent
    data = import_ok(client, [folder])
    expected = len(list(folder.glob("*.png")))
    assert data["imported_count"] == expected
    listed = client.get("/api/v1/images").json()["data"]
    assert listed["total"] == expected


def test_import_skips_unsupported_files(client, tmp_path):
    img = save_color_image(tmp_path / "ok.png", (10, 10, 10))
    txt = tmp_path / "notes.txt"
    txt.write_text("hello", encoding="utf-8")
    data = import_ok(client, [img, txt])
    assert data["imported_count"] == 1
    assert data["failed_count"] == 0


def test_library_grid_persists_after_reopen(data_dir, sample_files, monkeypatch):
    monkeypatch.setenv("POSEBOARD_DATA_DIR", str(data_dir))
    monkeypatch.setenv("POSEBOARD_DISABLE_WORKER", "1")
    from main import create_app
    from fastapi.testclient import TestClient

    with TestClient(create_app()) as c1:
        import_ok(c1, [sample_files["blue"], sample_files["orange"]])
        total = c1.get("/api/v1/images").json()["data"]["total"]
        assert total == 2

    with TestClient(create_app()) as c2:
        listed = c2.get("/api/v1/images").json()["data"]
        assert listed["total"] == 2
        assert listed["items"][0]["thumbnail_url"].startswith("/media/thumbnails/")


def test_empty_library_lists_zero(client):
    listed = client.get("/api/v1/images").json()["data"]
    assert listed["total"] == 0
    assert listed["items"] == []

from __future__ import annotations

import hashlib
from pathlib import Path

from PIL import Image


SUPPORTED_EXT = {".jpg", ".jpeg", ".png", ".webp"}
THUMB_MAX = 512


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def is_supported_image(path: Path) -> bool:
    return path.is_file() and path.suffix.lower() in SUPPORTED_EXT


def collect_image_paths(paths: list[str]) -> list[Path]:
    collected: list[Path] = []
    seen: set[str] = set()
    for raw in paths:
        p = Path(raw)
        if p.is_dir():
            for child in sorted(p.rglob("*")):
                if is_supported_image(child):
                    key = str(child.resolve())
                    if key not in seen:
                        seen.add(key)
                        collected.append(child.resolve())
        elif is_supported_image(p):
            key = str(p.resolve())
            if key not in seen:
                seen.add(key)
                collected.append(p.resolve())
    return collected


def make_thumbnail(src: Path, dest: Path, max_side: int = THUMB_MAX) -> tuple[int, int]:
    dest.parent.mkdir(parents=True, exist_ok=True)
    with Image.open(src) as im:
        im = im.convert("RGB")
        width, height = im.size
        im.thumbnail((max_side, max_side))
        im.save(dest, "WEBP", quality=80)
        return width, height

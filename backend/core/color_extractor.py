from __future__ import annotations

import colorsys
from typing import Any

import numpy as np
from PIL import Image

FAMILIES = [
    "red",
    "orange",
    "yellow",
    "green",
    "cyan",
    "blue",
    "purple",
    "pink",
    "brown",
    "black",
    "white",
    "gray",
]


def rgb_to_hsl(r: float, g: float, b: float) -> tuple[float, float, float]:
    h, l, s = colorsys.rgb_to_hls(r / 255.0, g / 255.0, b / 255.0)
    return h * 360.0, s, l


def family_from_rgb(r: float, g: float, b: float) -> str:
    h, s, l = rgb_to_hsl(r, g, b)
    if l < 0.12:
        return "black"
    if l > 0.88 and s < 0.25:
        return "white"
    if s < 0.12:
        return "gray"
    if 15 <= h < 50 and l < 0.40:
        return "brown"
    if h < 15 or h >= 345:
        return "red"
    if h < 40:
        return "orange"
    if h < 70:
        return "yellow"
    if h < 160:
        return "green"
    if h < 185:
        return "cyan"
    if h < 260:
        return "blue"
    if h < 290:
        return "purple"
    return "pink"


# Selecting "blue" should catch navy / sky / teal-blue, not one HEX.
# Do not cross-map red/pink: skin is often pink and must not pull blue photos into 红.
SIMILAR_FAMILIES: dict[str, set[str]] = {
    "red": {"red"},
    "pink": {"pink"},
    "orange": {"orange"},
    "yellow": {"yellow"},
    "green": {"green"},
    "cyan": {"cyan", "blue"},
    "blue": {"blue", "cyan"},
    "purple": {"purple"},
    "brown": {"brown"},
    "black": {"black"},
    "white": {"white"},
    "gray": {"gray"},
}


def _palette_list(palette) -> list:
    if not palette:
        return []
    if isinstance(palette, str):
        import json

        try:
            data = json.loads(palette)
            return data if isinstance(data, list) else []
        except json.JSONDecodeError:
            return []
    return palette if isinstance(palette, list) else []


def primary_family_of(image: dict) -> str | None:
    primary = image.get("primary_family")
    if primary:
        return primary
    palette = _palette_list(image.get("palette"))
    if palette and isinstance(palette[0], dict):
        return palette[0].get("family")
    return None


def secondary_from_palette(palette: list, primary: str | None) -> str | None:
    if not primary:
        return None
    for color in palette[1:]:
        if isinstance(color, dict):
            family = color.get("family")
            if family and family != primary:
                return family
    return None


def parse_family_list(raw) -> list[str]:
    if not raw:
        return []
    if isinstance(raw, list):
        return [str(x) for x in raw if x]
    if isinstance(raw, str):
        import json

        try:
            data = json.loads(raw)
            return [str(x) for x in data if x] if isinstance(data, list) else []
        except json.JSONDecodeError:
            return []
    return []


def resolve_secondary_family(image: dict) -> str | None:
    raw = image.get("secondary_family")
    if raw == "":
        return None
    if raw:
        return str(raw)
    return secondary_from_palette(_palette_list(image.get("palette")), primary_family_of(image))


def matches_secondary_filter(image: dict, wanted: set[str]) -> bool:
    if not wanted:
        return True
    have = set()
    secondary = resolve_secondary_family(image)
    if secondary:
        have.add(secondary)
    have.update(parse_family_list(image.get("extra_families")))
    for family in wanted:
        similar = SIMILAR_FAMILIES.get(family, {family})
        if have & similar:
            return True
    return False


def matches_family_filter(image: dict, wanted: set[str]) -> bool:
    """Match the dominant color only. Secondary blobs like skin do not count."""
    if not wanted:
        return True
    primary = primary_family_of(image)
    if not primary:
        return False
    for family in wanted:
        if primary in SIMILAR_FAMILIES.get(family, {family}):
            return True
    return False


def _kmeans(pixels: np.ndarray, k: int = 5, iters: int = 10, seed: int = 7) -> tuple[np.ndarray, np.ndarray]:
    rng = np.random.default_rng(seed)
    n = len(pixels)
    if n == 0:
        return np.zeros((0, 3)), np.zeros((0,))
    k = min(k, n)
    # spread init: pick along brightness
    brightness = pixels.mean(axis=1)
    order = np.argsort(brightness)
    picks = np.linspace(0, n - 1, k).astype(int)
    centers = pixels[order[picks]].astype(np.float64)
    labels = np.zeros(n, dtype=int)
    for _ in range(iters):
        dist = ((pixels[:, None, :] - centers[None, :, :]) ** 2).sum(axis=2)
        labels = dist.argmin(axis=1)
        for i in range(k):
            members = pixels[labels == i]
            if len(members):
                centers[i] = members.mean(axis=0)
    counts = np.bincount(labels, minlength=k).astype(np.float64)
    return centers, counts


def extract_palette(image_path: str | Any, k: int = 5) -> list[dict]:
    with Image.open(image_path) as im:
        im = im.convert("RGB")
        im.thumbnail((256, 256))
        arr = np.asarray(im, dtype=np.float64).reshape(-1, 3)

    centers, counts = _kmeans(arr, k=k)
    total = counts.sum() or 1.0
    colors: list[dict] = []
    for center, count in zip(centers, counts):
        ratio = float(count / total)
        if ratio < 0.03:
            continue
        r, g, b = [int(max(0, min(255, round(c)))) for c in center]
        h, s, l = rgb_to_hsl(r, g, b)
        colors.append(
            {
                "hex": f"#{r:02X}{g:02X}{b:02X}",
                "ratio": round(ratio, 4),
                "h": round(h, 2),
                "s": round(s, 4),
                "l": round(l, 4),
                "family": family_from_rgb(r, g, b),
            }
        )
    colors.sort(key=lambda c: c["ratio"], reverse=True)
    return colors[:5]


def extract_from_file(path) -> dict:
    palette = extract_palette(path)
    primary = palette[0]["family"] if palette else None
    secondary = secondary_from_palette(palette, primary)
    return {"palette": palette, "primary_family": primary, "secondary_family": secondary}

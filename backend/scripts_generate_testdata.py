from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1] / "testdata"
ROOT.mkdir(parents=True, exist_ok=True)

Image.new("RGB", (128, 128), (0, 40, 220)).save(ROOT / "blue_scene.png")
Image.new("RGB", (128, 128), (255, 140, 0)).save(ROOT / "orange_scene.png")
Image.new("RGB", (160, 100), (30, 160, 50)).save(ROOT / "landscape.png")
Image.new("RGB", (120, 180), (200, 160, 140)).save(ROOT / "person_a.png")
Image.new("RGB", (120, 180), (190, 150, 130)).save(ROOT / "person_b.png")
print("wrote", ROOT)

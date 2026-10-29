import type { CropBox } from "./boardMath";
import { normalizeCrop } from "./boardMath";

export type ColorSample = { hex: string; r: number; g: number; b: number };

export type SampleCard = {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  flipped?: boolean;
  crop?: CropBox;
};

export function rgbToHex(r: number, g: number, b: number): ColorSample {
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  const rr = clamp(r);
  const gg = clamp(g);
  const bb = clamp(b);
  const h = (n: number) => n.toString(16).padStart(2, "0").toUpperCase();
  return { hex: `#${h(rr)}${h(gg)}${h(bb)}`, r: rr, g: gg, b: bb };
}

export function cardLocalUV(
  card: SampleCard,
  world: { x: number; y: number }
): { u: number; v: number } | null {
  const w = Math.max(1, card.width);
  const h = Math.max(1, card.height);
  const cx = card.x + w / 2;
  const cy = card.y + h / 2;
  const rad = (-(card.rotation || 0) * Math.PI) / 180;
  const dx = world.x - cx;
  const dy = world.y - cy;
  let lx = dx * Math.cos(rad) - dy * Math.sin(rad);
  const ly = dx * Math.sin(rad) + dy * Math.cos(rad);
  if (card.flipped) lx = -lx;
  const u = (lx + w / 2) / w;
  const v = (ly + h / 2) / h;
  if (u < 0 || u > 1 || v < 0 || v > 1) return null;
  return { u, v };
}

export function uvToSourcePixel(
  uv: { u: number; v: number },
  crop: CropBox | undefined,
  naturalWidth: number,
  naturalHeight: number
): { x: number; y: number } {
  const box = normalizeCrop(crop || { x: 0, y: 0, w: 1, h: 1 });
  const x = Math.min(naturalWidth - 1, Math.max(0, Math.floor((box.x + uv.u * box.w) * naturalWidth)));
  const y = Math.min(naturalHeight - 1, Math.max(0, Math.floor((box.y + uv.v * box.h) * naturalHeight)));
  return { x, y };
}

export function hitCardIndex(cards: SampleCard[], world: { x: number; y: number }): number {
  for (let i = cards.length - 1; i >= 0; i -= 1) {
    if (cardLocalUV(cards[i], world)) return i;
  }
  return -1;
}

export function sampleCardColor(
  card: SampleCard & { htmlImage?: HTMLImageElement },
  world: { x: number; y: number }
): ColorSample | null {
  const img = card.htmlImage;
  if (!img?.naturalWidth || !img.naturalHeight) return null;
  const uv = cardLocalUV(card, world);
  if (!uv) return null;
  const pix = uvToSourcePixel(uv, card.crop, img.naturalWidth, img.naturalHeight);
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(img, pix.x, pix.y, 1, 1, 0, 0, 1, 1);
  const data = ctx.getImageData(0, 0, 1, 1).data;
  return rgbToHex(data[0], data[1], data[2]);
}

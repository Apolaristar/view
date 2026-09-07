import { fitCards, sourceCrop, type CropBox } from "./boardMath";

export type PreviewCard = {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  crop?: CropBox;
  htmlImage?: HTMLImageElement;
};

export function renderBoardPreview(cards: PreviewCard[], size = { w: 720, h: 450 }): string | null {
  if (!cards.length || typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = size.w;
  canvas.height = size.h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = "#f4f6f8";
  ctx.fillRect(0, 0, size.w, size.h);
  const view = fitCards(cards, size, 36);
  const z = view.zoom;
  let drawn = 0;
  for (const card of cards) {
    const img = card.htmlImage;
    if (!img?.naturalWidth) continue;
    const crop = sourceCrop(img.naturalWidth, img.naturalHeight, card.crop || { x: 0, y: 0, w: 1, h: 1 });
    const w = card.width * z;
    const h = card.height * z;
    const cx = card.x * z + view.pan.x + w / 2;
    const cy = card.y * z + view.pan.y + h / 2;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(((card.rotation || 0) * Math.PI) / 180);
    ctx.drawImage(img, crop.x, crop.y, crop.width, crop.height, -w / 2, -h / 2, w, h);
    ctx.restore();
    drawn += 1;
  }
  if (!drawn) return null;
  return canvas.toDataURL("image/jpeg", 0.84);
}

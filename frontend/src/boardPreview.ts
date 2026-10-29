import { fitCards, sourceCrop, type CropBox } from "./boardMath";

export type PreviewCard = {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  flipped?: boolean;
  grayscale?: boolean;
  crop?: CropBox;
  htmlImage?: HTMLImageElement;
};

export type ViewportView = {
  w: number;
  h: number;
  pan: { x: number; y: number };
  zoom: number;
  boardGray?: boolean;
  background?: string;
};

function drawCard(
  ctx: CanvasRenderingContext2D,
  card: PreviewCard,
  pan: { x: number; y: number },
  zoom: number,
  boardGray?: boolean
) {
  const img = card.htmlImage;
  if (!img?.naturalWidth) return false;
  const crop = sourceCrop(img.naturalWidth, img.naturalHeight, card.crop || { x: 0, y: 0, w: 1, h: 1 });
  const w = card.width * zoom;
  const h = card.height * zoom;
  const cx = card.x * zoom + pan.x + w / 2;
  const cy = card.y * zoom + pan.y + h / 2;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(((card.rotation || 0) * Math.PI) / 180);
  if (card.flipped) ctx.scale(-1, 1);
  if (boardGray || card.grayscale) ctx.filter = "grayscale(1)";
  ctx.drawImage(img, crop.x, crop.y, crop.width, crop.height, -w / 2, -h / 2, w, h);
  ctx.restore();
  return true;
}

export function renderBoardPreview(cards: PreviewCard[], size = { w: 720, h: 450 }): string | null {
  if (!cards.length || typeof document === "undefined") return null;
  if (!cards.some((card) => card.htmlImage?.naturalWidth)) return null;
  const canvas = document.createElement("canvas");
  canvas.width = size.w;
  canvas.height = size.h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = "#f4f6f8";
  ctx.fillRect(0, 0, size.w, size.h);
  const view = fitCards(cards, size, 36);
  let drawn = 0;
  for (const card of cards) {
    if (drawCard(ctx, card, view.pan, view.zoom)) drawn += 1;
  }
  if (!drawn) return null;
  return canvas.toDataURL("image/jpeg", 0.84);
}

export function renderBoardViewport(cards: PreviewCard[], view: ViewportView): string | null {
  if (!cards.length || typeof document === "undefined") return null;
  if (!cards.some((card) => card.htmlImage?.naturalWidth)) return null;
  const w = Math.max(1, Math.round(view.w));
  const h = Math.max(1, Math.round(view.h));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = view.background || "#f4f6f8";
  ctx.fillRect(0, 0, w, h);
  let drawn = 0;
  for (const card of cards) {
    if (drawCard(ctx, card, view.pan, view.zoom, view.boardGray)) drawn += 1;
  }
  if (!drawn) return null;
  return canvas.toDataURL("image/png");
}

export function renderSoloViewport(card: PreviewCard, size: { w: number; h: number }, boardGray?: boolean): string | null {
  const pad = 24;
  const fit = Math.min((size.w - pad * 2) / Math.max(1, card.width), (size.h - pad * 2) / Math.max(1, card.height), 8);
  const zoom = Math.max(0.05, fit);
  return renderBoardViewport([card], {
    w: size.w,
    h: size.h,
    pan: { x: (size.w - card.width * zoom) / 2, y: (size.h - card.height * zoom) / 2 },
    zoom,
    boardGray,
  });
}

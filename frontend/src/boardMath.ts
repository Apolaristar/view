export type CropBox = { x: number; y: number; w: number; h: number };

export function clamp(n: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, n));
}

export function normalizeCrop(box: CropBox): CropBox {
  const x = clamp(box.x);
  const y = clamp(box.y);
  const w = clamp(box.w, 0.05, 1);
  const h = clamp(box.h, 0.05, 1);
  return {
    x: clamp(x, 0, 1 - w),
    y: clamp(y, 0, 1 - h),
    w,
    h,
  };
}

export function rotateDelta(current: number, delta: number): number {
  const next = ((current || 0) + delta) % 360;
  return next < 0 ? next + 360 : next;
}

export function sourceCrop(
  naturalWidth: number,
  naturalHeight: number,
  box: CropBox
): { x: number; y: number; width: number; height: number } {
  const c = normalizeCrop(box);
  return {
    x: c.x * naturalWidth,
    y: c.y * naturalHeight,
    width: Math.max(1, c.w * naturalWidth),
    height: Math.max(1, c.h * naturalHeight),
  };
}

export function screenToWorld(
  sx: number,
  sy: number,
  pan: { x: number; y: number },
  zoom: number
): { x: number; y: number } {
  const z = zoom || 1;
  return { x: (sx - pan.x) / z, y: (sy - pan.y) / z };
}

export function zoomToward(
  pointer: { x: number; y: number },
  pan: { x: number; y: number },
  zoom: number,
  nextZoom: number
): { pan: { x: number; y: number }; zoom: number } {
  const world = screenToWorld(pointer.x, pointer.y, pan, zoom);
  return {
    zoom: nextZoom,
    pan: { x: pointer.x - world.x * nextZoom, y: pointer.y - world.y * nextZoom },
  };
}

export function centerOn(
  target: { x: number; y: number },
  view: { w: number; h: number },
  zoom: number
): { x: number; y: number } {
  const z = zoom || 1;
  return { x: view.w / 2 - target.x * z, y: view.h / 2 - target.y * z };
}

export function cardsCenter(cards: { x: number; y: number; width: number; height: number }[]): { x: number; y: number } {
  if (!cards.length) return { x: 0, y: 0 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const c of cards) {
    minX = Math.min(minX, c.x);
    minY = Math.min(minY, c.y);
    maxX = Math.max(maxX, c.x + c.width);
    maxY = Math.max(maxY, c.y + c.height);
  }
  return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
}

export function clampZoom(zoom: number, min = 0.1, max = 8): number {
  return Math.min(max, Math.max(min, zoom));
}

export function resetCardToOriginal(card: {
  width: number;
  height: number;
  naturalWidth?: number;
  naturalHeight?: number;
}): { rotation: number; crop: CropBox; width: number; height: number } {
  const nw = card.naturalWidth || 0;
  const nh = card.naturalHeight || 0;
  const ratio = nw > 0 && nh > 0 ? nh / nw : card.height / Math.max(1, card.width);
  return {
    rotation: 0,
    crop: { x: 0, y: 0, w: 1, h: 1 },
    width: card.width,
    height: Math.max(40, card.width * ratio),
  };
}

export function moveIndex<T>(items: T[], from: number, to: number): T[] {
  if (!items.length) return items;
  const last = items.length - 1;
  const src = Math.max(0, Math.min(last, from));
  const dst = Math.max(0, Math.min(last, to));
  if (src === dst) return items;
  const next = items.slice();
  const [item] = next.splice(src, 1);
  next.splice(dst, 0, item);
  return next;
}

export function fitCards(
  cards: { x: number; y: number; width: number; height: number }[],
  view: { w: number; h: number },
  pad = 48
): { pan: { x: number; y: number }; zoom: number } {
  if (!cards.length) return { pan: { x: 0, y: 0 }, zoom: 1 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const c of cards) {
    minX = Math.min(minX, c.x);
    minY = Math.min(minY, c.y);
    maxX = Math.max(maxX, c.x + c.width);
    maxY = Math.max(maxY, c.y + c.height);
  }
  const bw = Math.max(1, maxX - minX);
  const bh = Math.max(1, maxY - minY);
  const availW = Math.max(1, view.w - pad * 2);
  const availH = Math.max(1, view.h - pad * 2);
  const zoom = Math.min(1, availW / bw, availH / bh);
  return {
    zoom,
    pan: {
      x: (view.w - bw * zoom) / 2 - minX * zoom,
      y: (view.h - bh * zoom) / 2 - minY * zoom,
    },
  };
}

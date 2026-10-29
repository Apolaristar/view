import { clamp, type CropBox } from "./boardMath";

export type { CropBox };

export function fitImageView(
  naturalW: number,
  naturalH: number,
  viewW: number,
  viewH: number,
  pad = 12
): { pan: { x: number; y: number }; zoom: number } {
  const nw = Math.max(1, naturalW);
  const nh = Math.max(1, naturalH);
  const availW = Math.max(1, viewW - pad * 2);
  const availH = Math.max(1, viewH - pad * 2);
  const zoom = Math.min(availW / nw, availH / nh);
  return {
    zoom,
    pan: {
      x: (viewW - nw * zoom) / 2,
      y: (viewH - nh * zoom) / 2,
    },
  };
}

export function clampPreviewZoom(zoom: number, fit: number): number {
  const min = Math.min(fit * 0.25, 0.05) || 0.05;
  const max = Math.max(8, fit * 12);
  return Math.min(max, Math.max(min, zoom));
}

export type CropHandle = "move" | "n" | "s" | "e" | "w" | "nw" | "ne" | "sw" | "se";

const MIN_VIEW_BOX = 8;

export function viewPointFromScreen(
  clientX: number,
  clientY: number,
  stage: { left: number; top: number }
): { x: number; y: number } {
  return { x: clientX - stage.left, y: clientY - stage.top };
}

export function normalizeViewBox(box: CropBox, viewW: number, viewH: number, min = MIN_VIEW_BOX): CropBox {
  const vw = Math.max(min, viewW);
  const vh = Math.max(min, viewH);
  const w = clamp(box.w, min, vw);
  const h = clamp(box.h, min, vh);
  return {
    x: clamp(box.x, 0, vw - w),
    y: clamp(box.y, 0, vh - h),
    w,
    h,
  };
}

export function viewBoxFromPoints(
  a: { x: number; y: number },
  b: { x: number; y: number },
  viewW: number,
  viewH: number
): CropBox {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return normalizeViewBox({ x, y, w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) }, viewW, viewH);
}

export function applyViewBoxDrag(
  kind: CropHandle,
  start: CropBox,
  from: { x: number; y: number },
  to: { x: number; y: number },
  viewW: number,
  viewH: number
): CropBox {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (kind === "move") {
    return normalizeViewBox({ ...start, x: start.x + dx, y: start.y + dy }, viewW, viewH);
  }
  let { x, y, w, h } = start;
  if (kind.includes("w")) {
    const nx = clamp(start.x + dx, 0, start.x + start.w - MIN_VIEW_BOX);
    w = start.x + start.w - nx;
    x = nx;
  }
  if (kind.includes("e")) w = clamp(start.w + dx, MIN_VIEW_BOX, viewW - start.x);
  if (kind.includes("n")) {
    const ny = clamp(start.y + dy, 0, start.y + start.h - MIN_VIEW_BOX);
    h = start.y + start.h - ny;
    y = ny;
  }
  if (kind.includes("s")) h = clamp(start.h + dy, MIN_VIEW_BOX, viewH - start.y);
  return normalizeViewBox({ x, y, w, h }, viewW, viewH);
}

export function imageViewport(
  pan: { x: number; y: number },
  zoom: number,
  viewW: number,
  viewH: number
): { x: number; y: number; w: number; h: number } {
  const z = zoom || 1;
  return { x: -pan.x / z, y: -pan.y / z, w: viewW / z, h: viewH / z };
}

export function minimapSize(naturalW: number, naturalH: number, maxW: number, maxH: number): { w: number; h: number; scale: number } {
  const nw = Math.max(1, naturalW);
  const nh = Math.max(1, naturalH);
  const scale = Math.min(maxW / nw, maxH / nh);
  return { w: Math.max(1, nw * scale), h: Math.max(1, nh * scale), scale };
}

export function minimapViewRect(
  viewport: { x: number; y: number; w: number; h: number },
  naturalW: number,
  naturalH: number,
  scale: number
): { x: number; y: number; w: number; h: number } {
  const x1 = Math.max(viewport.x, 0);
  const y1 = Math.max(viewport.y, 0);
  const x2 = Math.min(viewport.x + viewport.w, naturalW);
  const y2 = Math.min(viewport.y + viewport.h, naturalH);
  return {
    x: x1 * scale,
    y: y1 * scale,
    w: Math.max(2, (x2 - x1) * scale),
    h: Math.max(2, (y2 - y1) * scale),
  };
}

export function panFromMinimapPoint(
  image: { x: number; y: number },
  view: { w: number; h: number },
  zoom: number
): { x: number; y: number } {
  const z = zoom || 1;
  return { x: view.w / 2 - image.x * z, y: view.h / 2 - image.y * z };
}

export function panFromMinimapDrag(
  startPan: { x: number; y: number },
  delta: { x: number; y: number },
  scale: number,
  zoom: number
): { x: number; y: number } {
  const s = scale || 1;
  const z = zoom || 1;
  return { x: startPan.x - (delta.x / s) * z, y: startPan.y - (delta.y / s) * z };
}

export function pageRectFromViewBox(
  box: CropBox,
  stage: { left: number; top: number }
): { x: number; y: number; width: number; height: number } {
  return {
    x: stage.left + box.x,
    y: stage.top + box.y,
    width: box.w,
    height: box.h,
  };
}

export function clampPopup(
  point: { x: number; y: number },
  size: { w: number; h: number },
  view: { w: number; h: number },
  pad = 8
): { x: number; y: number } {
  const w = Math.max(0, size.w);
  const h = Math.max(0, size.h);
  const maxX = Math.max(pad, view.w - w - pad);
  const maxY = Math.max(pad, view.h - h - pad);
  let x = point.x;
  let y = point.y;
  if (x + w > view.w - pad) x = maxX;
  if (y + h > view.h - pad) y = maxY;
  return {
    x: Math.min(maxX, Math.max(pad, x)),
    y: Math.min(maxY, Math.max(pad, y)),
  };
}

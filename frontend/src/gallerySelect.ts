export type Rect = { x: number; y: number; w: number; h: number };

export function rectFromPoints(a: { x: number; y: number }, b: { x: number; y: number }): Rect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) };
}

export function rectsIntersect(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export function idsHitByMarquee(thumbs: { id: number; rect: Rect }[], marquee: Rect): number[] {
  if (marquee.w < 2 && marquee.h < 2) return [];
  return thumbs.filter((thumb) => rectsIntersect(thumb.rect, marquee)).map((thumb) => thumb.id);
}

export function mergeSelection(prev: number[], next: number[], mode: "replace" | "add" | "subtract"): number[] {
  if (mode === "replace") return [...new Set(next)];
  if (mode === "add") {
    const set = new Set(prev);
    for (const id of next) set.add(id);
    return [...set];
  }
  const remove = new Set(next);
  return prev.filter((id) => !remove.has(id));
}

export function shouldStartMarquee(dx: number, dy: number, threshold = 6): boolean {
  return Math.hypot(dx, dy) >= threshold;
}

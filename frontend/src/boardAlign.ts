export type AlignRect = { x: number; y: number; width: number; height: number; rotation?: number };

export type AlignEdge = "left" | "right" | "top" | "bottom";
export type DistributeAxis = "x" | "y";

export function viewAsBoard(
  view: { w: number; h: number },
  pan: { x: number; y: number },
  zoom: number
): AlignRect {
  const z = zoom || 1;
  return {
    x: (0 - pan.x) / z,
    y: (0 - pan.y) / z,
    width: view.w / z,
    height: view.h / z,
  };
}

export function selectionBounds(cards: AlignRect[]): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} {
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
  return { minX, minY, maxX, maxY };
}

export function alignToBoard<T extends AlignRect>(cards: T[], edge: AlignEdge, board: AlignRect): T[] {
  if (!cards.length) return cards;
  return cards.map((c) => {
    if (edge === "left") return { ...c, x: board.x };
    if (edge === "right") return { ...c, x: board.x + board.width - c.width };
    if (edge === "top") return { ...c, y: board.y };
    return { ...c, y: board.y + board.height - c.height };
  });
}

export function distributeOnBoard<T extends AlignRect>(cards: T[], axis: DistributeAxis, board: AlignRect): T[] {
  if (cards.length < 2) return cards;
  const indexed = cards.map((c, i) => ({ c, i }));
  const next = cards.slice();
  if (axis === "x") {
    indexed.sort((a, b) => a.c.x - b.c.x || a.i - b.i);
    const totalW = indexed.reduce((s, item) => s + item.c.width, 0);
    const gap = (board.width - totalW) / (indexed.length - 1);
    let x = board.x;
    for (const item of indexed) {
      next[item.i] = { ...next[item.i], x };
      x += item.c.width + gap;
    }
    return next;
  }
  indexed.sort((a, b) => a.c.y - b.c.y || a.i - b.i);
  const totalH = indexed.reduce((s, item) => s + item.c.height, 0);
  const gap = (board.height - totalH) / (indexed.length - 1);
  let y = board.y;
  for (const item of indexed) {
    next[item.i] = { ...next[item.i], y };
    y += item.c.height + gap;
  }
  return next;
}

export function unifyHeight<T extends AlignRect>(cards: T[], targetHeight: number): T[] {
  if (cards.length < 2) return cards;
  const height = Math.max(1, targetHeight);
  return cards.map((c) => {
    const ratio = c.width / Math.max(1, c.height);
    return { ...c, height, width: Math.max(1, height * ratio) };
  });
}

export function packInView<T extends AlignRect>(cards: T[], board: AlignRect, gap = 8): T[] {
  if (!cards.length) return cards;
  const pad = 8;
  const maxW = Math.max(1, board.width - pad * 2);
  const maxH = Math.max(1, board.height - pad * 2);
  const sizes = cards.map((c) => ({ w: Math.max(1, c.width), h: Math.max(1, c.height) }));

  function layout(scale: number) {
    const placed: { x: number; y: number; w: number; h: number }[] = [];
    let x = 0;
    let y = 0;
    let rowH = 0;
    let usedW = 0;
    for (const s of sizes) {
      const w = Math.min(maxW, s.w * scale);
      const h = w * (s.h / s.w);
      if (x > 0 && x + w > maxW + 0.5) {
        x = 0;
        y += rowH + gap;
        rowH = 0;
      }
      placed.push({ x, y, w, h });
      x += w + gap;
      rowH = Math.max(rowH, h);
      usedW = Math.max(usedW, x - gap);
    }
    return { placed, usedW, usedH: y + rowH };
  }

  let scale = 1;
  const first = layout(1);
  if (first.usedH > maxH + 0.5 || first.usedW > maxW + 0.5) {
    let lo = 0.05;
    let hi = 1;
    for (let i = 0; i < 18; i++) {
      const mid = (lo + hi) / 2;
      const trial = layout(mid);
      if (trial.usedH <= maxH + 0.5 && trial.usedW <= maxW + 0.5) lo = mid;
      else hi = mid;
    }
    scale = lo;
  }

  const { placed, usedW, usedH } = layout(scale);
  const ox = board.x + pad + Math.max(0, (maxW - usedW) / 2);
  const oy = board.y + pad + Math.max(0, (maxH - usedH) / 2);
  return cards.map((c, i) => ({
    ...c,
    rotation: 0,
    width: placed[i].w,
    height: placed[i].h,
    x: ox + placed[i].x,
    y: oy + placed[i].y,
  }));
}

export function applyToIndices<T>(items: T[], indices: number[], transform: (subset: T[]) => T[]): T[] {
  if (!indices.length) return items;
  const subset = indices.map((i) => items[i]);
  const nextSubset = transform(subset);
  const out = items.slice();
  indices.forEach((i, k) => {
    out[i] = nextSubset[k];
  });
  return out;
}

export function rectsOverlap(a: AlignRect, b: AlignRect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

export function marqueeRect(a: { x: number; y: number }, b: { x: number; y: number }): AlignRect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, width: Math.abs(b.x - a.x), height: Math.abs(b.y - a.y) };
}

export function indicesInMarquee(cards: AlignRect[], box: AlignRect): number[] {
  if (box.width < 2 && box.height < 2) return [];
  const hit: number[] = [];
  cards.forEach((c, i) => {
    if (rectsOverlap(c, box)) hit.push(i);
  });
  return hit;
}

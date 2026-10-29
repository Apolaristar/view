export const SKETCH_SEC_MIN = 1;
export const SKETCH_SEC_MAX = 600;
export const SKETCH_SEC_DEFAULT = 30;

export function clampSketchSeconds(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return SKETCH_SEC_DEFAULT;
  return Math.min(SKETCH_SEC_MAX, Math.max(SKETCH_SEC_MIN, Math.round(n)));
}

export function parseStoredSketchSeconds(raw: string | null | undefined): number {
  return clampSketchSeconds(raw == null || raw === "" ? SKETCH_SEC_DEFAULT : Number(raw));
}

export function sketchStartIndex(selectedIndex: number | undefined, total: number): number {
  if (total <= 0) return 0;
  if (selectedIndex == null || selectedIndex < 0 || selectedIndex >= total) return 0;
  return selectedIndex;
}

export function sketchAdvance(currentIndex: number, total: number): { nextIndex: number; done: boolean } {
  if (total <= 0) return { nextIndex: 0, done: true };
  if (currentIndex >= total - 1) return { nextIndex: currentIndex, done: true };
  return { nextIndex: currentIndex + 1, done: false };
}

export function sketchRemainSeconds(endsAt: number, now = Date.now()): number {
  return Math.max(0, (endsAt - now) / 1000);
}

export function formatSketchClock(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m <= 0) return `${r}s`;
  return `${m}:${String(r).padStart(2, "0")}`;
}

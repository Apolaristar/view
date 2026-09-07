export type PoseLandmark = {
  id: number;
  x: number;
  y: number;
  visibility?: number;
};

export const VISIBILITY_MIN = 0.5;

/** Nose, shoulders, elbows, wrists, hips, knees, ankles. */
export const BODY_LANDMARK_IDS = [0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28] as const;
const BODY_LANDMARK_SET = new Set<number>(BODY_LANDMARK_IDS);

/** Stick-figure bones using the 13 body joints. */
export const POSE_BONES: [number, number][] = [
  [11, 12],
  [11, 13],
  [13, 15],
  [12, 14],
  [14, 16],
  [11, 23],
  [12, 24],
  [23, 24],
  [23, 25],
  [25, 27],
  [24, 26],
  [26, 28],
];

export type SkeletonPoint = { id: number; x: number; y: number };
export type SkeletonLine = { x1: number; y1: number; x2: number; y2: number };
export type SkeletonHead = { cx: number; cy: number; r: number };

export function isVisibleLandmark(point: PoseLandmark, min = VISIBILITY_MIN): boolean {
  return (point.visibility ?? 1) >= min;
}

export function hasPoseOverlay(item?: { pose_status?: string; pose_landmarks?: PoseLandmark[] } | null): boolean {
  return item?.pose_status === "ok" && (item.pose_landmarks?.length ?? 0) > 0;
}

export function skeletonGeometry(
  landmarks: PoseLandmark[],
  width: number,
  height: number
): { points: SkeletonPoint[]; lines: SkeletonLine[]; head: SkeletonHead | null } {
  const byId = new Map<number, PoseLandmark>();
  for (const point of landmarks) byId.set(point.id, point);

  const toXy = (point: PoseLandmark) => ({ x: point.x * width, y: point.y * height });

  const points: SkeletonPoint[] = landmarks
    .filter((p) => BODY_LANDMARK_SET.has(p.id) && isVisibleLandmark(p))
    .map((p) => ({ id: p.id, ...toXy(p) }));

  const lines: SkeletonLine[] = [];
  for (const [a, b] of POSE_BONES) {
    const pa = byId.get(a);
    const pb = byId.get(b);
    if (!pa || !pb || !isVisibleLandmark(pa) || !isVisibleLandmark(pb)) continue;
    const sa = toXy(pa);
    const sb = toXy(pb);
    lines.push({ x1: sa.x, y1: sa.y, x2: sb.x, y2: sb.y });
  }

  const left = byId.get(11);
  const right = byId.get(12);
  const nose = byId.get(0);
  if (nose && isVisibleLandmark(nose) && left && right && isVisibleLandmark(left) && isVisibleLandmark(right)) {
    const shoulder = { x: ((left.x + right.x) / 2) * width, y: ((left.y + right.y) / 2) * height };
    const n = toXy(nose);
    lines.push({ x1: n.x, y1: n.y, x2: shoulder.x, y2: shoulder.y });
  }

  let head: SkeletonHead | null = null;
  if (nose && isVisibleLandmark(nose)) {
    const n = toXy(nose);
    head = { cx: n.x, cy: n.y, r: Math.max(6, Math.min(width, height) * 0.035) };
  }

  return { points, lines, head };
}

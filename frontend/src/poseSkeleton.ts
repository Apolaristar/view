export type PoseLandmark = {
  id: number;
  x: number;
  y: number;
  visibility?: number;
  person?: number;
};

export const VISIBILITY_MIN = 0.5;

/** Nose, shoulders, elbows, wrists, hips, knees, ankles. */
export const BODY_LANDMARK_IDS = [0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28] as const;
const BODY_LANDMARK_SET = new Set<number>(BODY_LANDMARK_IDS);

/** BlazeFace 6 points mapped onto pose ids: nose, eyes, ears, mouth. */
export const FACE_LANDMARK_IDS = [0, 2, 5, 7, 8, 9] as const;
const FACE_DRAW_SET = new Set<number>(FACE_LANDMARK_IDS);
const FACE_POINT_IDS = new Set<number>([2, 5, 7, 8, 9]);
export const FACE_BONES: [number, number][] = [
  [7, 2],
  [2, 0],
  [0, 5],
  [5, 8],
  [2, 5],
  [0, 9],
];

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

export type SkeletonPoint = { id: number; x: number; y: number; person: number; primary: boolean };
export type SkeletonLine = { x1: number; y1: number; x2: number; y2: number; person: number; primary: boolean };
export type SkeletonHead = { cx: number; cy: number; r: number; person: number; primary: boolean };
export type FaceKind = "eye" | "nose" | "mouth" | "ear";
export type FacePoint = SkeletonPoint & { kind: FaceKind };
export type FaceLine = SkeletonLine;

export function isVisibleLandmark(point: PoseLandmark, min = VISIBILITY_MIN): boolean {
  return (point.visibility ?? 1) >= min;
}

export function hasPoseOverlay(item?: { pose_status?: string; pose_landmarks?: PoseLandmark[] } | null): boolean {
  return item?.pose_status === "ok" && (item.pose_landmarks?.length ?? 0) > 0;
}

export function hasFaceOverlay(item?: { pose_status?: string; pose_landmarks?: PoseLandmark[] } | null): boolean {
  if (item?.pose_status !== "ok") return false;
  return (item.pose_landmarks ?? []).some((p) => FACE_POINT_IDS.has(p.id) && isVisibleLandmark(p));
}

export function posePeopleCount(landmarks?: PoseLandmark[] | null): number {
  if (!landmarks?.length) return 0;
  return new Set(landmarks.map((p) => p.person ?? 0)).size;
}

export function groupPeople(landmarks: PoseLandmark[]): PoseLandmark[][] {
  const buckets = new Map<number, PoseLandmark[]>();
  for (const point of landmarks) {
    const person = point.person ?? 0;
    const group = buckets.get(person);
    if (group) group.push(point);
    else buckets.set(person, [point]);
  }
  return [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, points]) => points);
}

function skeletonForPerson(
  landmarks: PoseLandmark[],
  width: number,
  height: number,
  person: number,
  primary: boolean
): { points: SkeletonPoint[]; lines: SkeletonLine[]; head: SkeletonHead | null } {
  const byId = new Map<number, PoseLandmark>();
  for (const point of landmarks) byId.set(point.id, point);
  const toXy = (point: PoseLandmark) => ({ x: point.x * width, y: point.y * height });

  const points: SkeletonPoint[] = landmarks
    .filter((p) => BODY_LANDMARK_SET.has(p.id) && isVisibleLandmark(p))
    .map((p) => ({ id: p.id, person, primary, ...toXy(p) }));

  const lines: SkeletonLine[] = [];
  for (const [a, b] of POSE_BONES) {
    const pa = byId.get(a);
    const pb = byId.get(b);
    if (!pa || !pb || !isVisibleLandmark(pa) || !isVisibleLandmark(pb)) continue;
    const sa = toXy(pa);
    const sb = toXy(pb);
    lines.push({ x1: sa.x, y1: sa.y, x2: sb.x, y2: sb.y, person, primary });
  }

  const left = byId.get(11);
  const right = byId.get(12);
  const nose = byId.get(0);
  if (nose && isVisibleLandmark(nose) && left && right && isVisibleLandmark(left) && isVisibleLandmark(right)) {
    const shoulder = { x: ((left.x + right.x) / 2) * width, y: ((left.y + right.y) / 2) * height };
    const n = toXy(nose);
    lines.push({ x1: n.x, y1: n.y, x2: shoulder.x, y2: shoulder.y, person, primary });
  }

  let head: SkeletonHead | null = null;
  if (nose && isVisibleLandmark(nose)) {
    const n = toXy(nose);
    head = { cx: n.x, cy: n.y, r: Math.max(6, Math.min(width, height) * 0.035), person, primary };
  }

  return { points, lines, head };
}

export function skeletonGeometry(
  landmarks: PoseLandmark[],
  width: number,
  height: number
): { points: SkeletonPoint[]; lines: SkeletonLine[]; head: SkeletonHead | null; heads: SkeletonHead[] } {
  const people = groupPeople(landmarks);
  const points: SkeletonPoint[] = [];
  const lines: SkeletonLine[] = [];
  const heads: SkeletonHead[] = [];
  people.forEach((personPoints, index) => {
    const person = personPoints[0]?.person ?? index;
    const piece = skeletonForPerson(personPoints, width, height, person, index === 0);
    points.push(...piece.points);
    lines.push(...piece.lines);
    if (piece.head) heads.push(piece.head);
  });
  return { points, lines, head: heads[0] ?? null, heads };
}

function faceKind(id: number): FaceKind {
  if (id === 2 || id === 5) return "eye";
  if (id === 0) return "nose";
  if (id === 9) return "mouth";
  return "ear";
}

function faceForPerson(
  landmarks: PoseLandmark[],
  width: number,
  height: number,
  person: number,
  primary: boolean
): { points: FacePoint[]; lines: FaceLine[] } {
  const byId = new Map<number, PoseLandmark>();
  for (const point of landmarks) byId.set(point.id, point);
  const toXy = (point: PoseLandmark) => ({ x: point.x * width, y: point.y * height });
  const points: FacePoint[] = landmarks
    .filter((p) => FACE_DRAW_SET.has(p.id) && isVisibleLandmark(p))
    .map((p) => ({ id: p.id, person, primary, kind: faceKind(p.id), ...toXy(p) }));
  const lines: FaceLine[] = [];
  for (const [a, b] of FACE_BONES) {
    const pa = byId.get(a);
    const pb = byId.get(b);
    if (!pa || !pb || !isVisibleLandmark(pa) || !isVisibleLandmark(pb)) continue;
    const sa = toXy(pa);
    const sb = toXy(pb);
    lines.push({ x1: sa.x, y1: sa.y, x2: sb.x, y2: sb.y, person, primary });
  }
  return { points, lines };
}

export function faceGeometry(
  landmarks: PoseLandmark[],
  width: number,
  height: number
): { points: FacePoint[]; lines: FaceLine[] } {
  const people = groupPeople(landmarks);
  const points: FacePoint[] = [];
  const lines: FaceLine[] = [];
  people.forEach((personPoints, index) => {
    const person = personPoints[0]?.person ?? index;
    const piece = faceForPerson(personPoints, width, height, person, index === 0);
    points.push(...piece.points);
    lines.push(...piece.lines);
  });
  return { points, lines };
}

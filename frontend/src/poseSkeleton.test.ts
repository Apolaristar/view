import { describe, expect, it } from "vitest";
import { hasPoseOverlay, skeletonGeometry, type PoseLandmark } from "./poseSkeleton";

function lm(id: number, x: number, y: number, visibility = 1): PoseLandmark {
  return { id, x, y, visibility };
}

describe("pose skeleton overlay", () => {
  it("only turns on when pose extraction succeeded", () => {
    expect(hasPoseOverlay({ pose_status: "ok", pose_landmarks: [lm(0, 0.5, 0.1)] })).toBe(true);
    expect(hasPoseOverlay({ pose_status: "none", pose_landmarks: [lm(0, 0.5, 0.1)] })).toBe(false);
    expect(hasPoseOverlay({ pose_status: "ok", pose_landmarks: [] })).toBe(false);
  });

  it("maps normalized landmarks onto pixel size", () => {
    const { points } = skeletonGeometry([lm(0, 0.25, 0.5)], 200, 100);
    expect(points).toEqual([{ id: 0, x: 50, y: 50 }]);
  });

  it("ignores face and finger landmarks", () => {
    const { points, lines } = skeletonGeometry(
      [lm(0, 0.5, 0.1), lm(2, 0.48, 0.08), lm(19, 0.2, 0.6), lm(11, 0.4, 0.3), lm(12, 0.6, 0.3)],
      100,
      100
    );
    expect(points.map((p) => p.id).sort((a, b) => a - b)).toEqual([0, 11, 12]);
    expect(lines.some((l) => l.x1 === 20 || l.x2 === 20)).toBe(false);
  });

  it("skips bones when a joint is missing or occluded", () => {
    const { lines } = skeletonGeometry(
      [
        lm(11, 0.4, 0.3),
        lm(13, 0.35, 0.45, 0.1),
        lm(15, 0.3, 0.6),
      ],
      100,
      100
    );
    expect(lines).toHaveLength(0);
  });

  it("draws a shoulder-to-shoulder bone and a neck to the nose", () => {
    const { lines, head } = skeletonGeometry(
      [lm(0, 0.5, 0.1), lm(11, 0.4, 0.3), lm(12, 0.6, 0.3)],
      100,
      200
    );
    expect(lines).toContainEqual({ x1: 40, y1: 60, x2: 60, y2: 60 });
    expect(lines).toContainEqual({ x1: 50, y1: 20, x2: 50, y2: 60 });
    expect(head).toMatchObject({ cx: 50, cy: 20 });
  });
});

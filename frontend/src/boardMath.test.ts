import { describe, expect, it } from "vitest";
import { cardsCenter, centerOn, fitCards, moveIndex, normalizeCrop, resetCardToOriginal, rotateDelta, sourceCrop, zoomToward } from "./boardMath";

describe("board crop and rotate helpers", () => {
  it("clamps crop boxes inside the image", () => {
    const box = normalizeCrop({ x: -0.2, y: 0.9, w: 0.5, h: 0.5 });
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y + box.h).toBeLessThanOrEqual(1.0001);
    expect(box.w).toBeGreaterThanOrEqual(0.05);
  });

  it("wraps rotation into 0-360", () => {
    expect(rotateDelta(350, 20)).toBe(10);
    expect(rotateDelta(10, -20)).toBe(350);
  });

  it("maps crop fractions onto source pixels", () => {
    const crop = sourceCrop(1000, 500, { x: 0.1, y: 0.2, w: 0.5, h: 0.4 });
    expect(crop.x).toBe(100);
    expect(crop.y).toBe(100);
    expect(crop.width).toBe(500);
    expect(crop.height).toBe(200);
  });

  it("zooms toward the pointer instead of the origin", () => {
    const next = zoomToward({ x: 200, y: 100 }, { x: 0, y: 0 }, 1, 2);
    expect(next.pan.x).toBe(-200);
    expect(next.pan.y).toBe(-100);
  });

  it("fits cards into the viewport", () => {
    const view = fitCards(
      [
        { x: 0, y: 0, width: 200, height: 100 },
        { x: 200, y: 0, width: 200, height: 100 },
      ],
      { w: 400, h: 200 },
      0
    );
    expect(view.zoom).toBe(1);
    expect(view.pan.x).toBe(0);
    expect(view.pan.y).toBe(50);
  });

  it("centers the view on a point without changing zoom", () => {
    const pan = centerOn({ x: 100, y: 50 }, { w: 400, h: 200 }, 2);
    expect(pan.x).toBe(0);
    expect(pan.y).toBe(0);
    expect(cardsCenter([{ x: 0, y: 0, width: 200, height: 100 }])).toEqual({ x: 100, y: 50 });
  });

  it("moves a card in the stack to change layer order", () => {
    expect(moveIndex(["a", "b", "c"], 0, 2)).toEqual(["b", "c", "a"]);
    expect(moveIndex(["a", "b", "c"], 2, 0)).toEqual(["c", "a", "b"]);
    expect(moveIndex(["a", "b", "c"], 1, 1)).toEqual(["a", "b", "c"]);
  });

  it("restores original image aspect after crop", () => {
    const next = resetCardToOriginal({ width: 320, height: 80, naturalWidth: 400, naturalHeight: 300 });
    expect(next.crop).toEqual({ x: 0, y: 0, w: 1, h: 1 });
    expect(next.rotation).toBe(0);
    expect(next.width).toBe(320);
    expect(next.height).toBe(240);
  });
});

describe("board canvas preview", () => {
  it("does not render a preview when the canvas is empty", async () => {
    const { renderBoardPreview } = await import("./boardPreview");
    expect(renderBoardPreview([])).toBeNull();
  });
});

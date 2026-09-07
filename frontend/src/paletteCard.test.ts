import { describe, expect, it } from "vitest";
import { paletteCssVars, paletteHexList } from "./paletteCard";
import type { PaletteColor } from "./types";

describe("paletteCard text export", () => {
  const colors = [
    { hex: "#AABBCC", ratio: 0.6, h: 0, s: 0, l: 0, family: "blue" },
    { hex: "#112233", ratio: 0.4, h: 0, s: 0, l: 0, family: "black" },
  ] as PaletteColor[];

  it("joins hex codes", () => {
    expect(paletteHexList(colors)).toBe("#AABBCC\n#112233");
  });

  it("writes css variables", () => {
    expect(paletteCssVars(colors)).toContain("--c1: #AABBCC;");
    expect(paletteCssVars(colors)).toContain("--c2: #112233;");
  });
});

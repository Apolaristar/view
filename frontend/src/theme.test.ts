import { describe, expect, it } from "vitest";
import { parseTheme, THEMES } from "./theme";

describe("ui themes", () => {
  it("has three named styles", () => {
    expect(THEMES.map((t) => t.id)).toEqual(["atelier", "night", "paper"]);
    expect(THEMES.map((t) => t.label)).toEqual(["画室", "墨夜", "稿纸"]);
  });

  it("falls back to atelier", () => {
    expect(parseTheme("night")).toBe("night");
    expect(parseTheme("paper")).toBe("paper");
    expect(parseTheme("unknown")).toBe("atelier");
    expect(parseTheme(undefined)).toBe("atelier");
  });
});

import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import FamilyPicker, { FamilyDropdown } from "./FamilyPicker";
import { FAMILY_SWATCH } from "../types";

function hexToHue(hex: string) {
  const n = parseInt(hex.replace("#", ""), 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d === 0) return 0;
  let h = 0;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return ((h * 60) + 360) % 360;
}

describe("color family swatches", () => {
  it("keeps cyan and blue far apart so 青 and 蓝 are easy to tell", () => {
    const cyan = hexToHue(FAMILY_SWATCH.cyan);
    const blue = hexToHue(FAMILY_SWATCH.blue);
    const delta = Math.min(Math.abs(cyan - blue), 360 - Math.abs(cyan - blue));
    expect(delta).toBeGreaterThan(40);
    expect(cyan).toBeGreaterThan(140);
    expect(cyan).toBeLessThan(185);
    expect(blue).toBeGreaterThan(210);
  });
});

describe("FamilyDropdown", () => {
  it("changes the current color after opening the menu", () => {
    const onChange = vi.fn();
    render(<FamilyDropdown value="orange" onChange={onChange} />);
    fireEvent.click(screen.getByLabelText("更改颜色 橙"));
    fireEvent.click(screen.getByLabelText("红"));
    expect(onChange).toHaveBeenCalledWith("red");
  });

  it("adds a secondary color from the plus button", () => {
    const onChange = vi.fn();
    render(<FamilyDropdown trigger="add" onChange={onChange} exclude={["orange"]} />);
    fireEvent.click(screen.getByLabelText("再添加副色"));
    fireEvent.click(screen.getByLabelText("蓝"));
    expect(onChange).toHaveBeenCalledWith("blue");
  });

  it("does not show chinese labels as visible text in the grid", () => {
    const { container } = render(<FamilyPicker value="orange" onChange={() => {}} />);
    expect(container.textContent).not.toContain("橙");
    expect(container.textContent).not.toContain("红");
  });
});

import { describe, expect, it } from "vitest";
import NAV from "./nav";
import { COLOR_FAMILIES } from "./types";
import { APP_NAME, poseStatusText } from "./i18n";

describe("navigation and scope", () => {
  it("only has the four first-version routes", () => {
    expect(NAV.map((n) => n.key)).toEqual(["/", "/library", "/boards", "/settings"]);
    expect(NAV.map((n) => n.label)).toEqual(["首页", "图库", "画板", "设置"]);
    const blob = JSON.stringify(NAV);
    expect(blob).not.toMatch(/计划|健身|咨询|饮食|游戏|自媒体/);
  });

  it("does not include drawing tools in color families", () => {
    expect(COLOR_FAMILIES).toHaveLength(12);
  });

  it("shows Chinese status labels", () => {
    expect(APP_NAME).toBe("姿态图库");
    expect(poseStatusText("pending")).toBe("排队中");
    expect(poseStatusText("ok")).toBe("已识别");
    expect(poseStatusText("none")).toBe("无人体");
    expect(poseStatusText("failed")).toBe("失败");
  });
});

import { describe, expect, it } from "vitest";
import { moveById, replaceGroup } from "./tagOrder";

describe("moveById", () => {
  it("moves a tag in front of another", () => {
    const items = [{ id: 1 }, { id: 2 }, { id: 3 }];
    expect(moveById(items, 3, 1).map((x) => x.id)).toEqual([3, 1, 2]);
  });

  it("replaces a group in place", () => {
    const all = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }];
    expect(replaceGroup(all, [{ id: 3 }, { id: 2 }]).map((x) => x.id)).toEqual([1, 3, 2, 4]);
  });
});

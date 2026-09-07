import { describe, expect, it } from "vitest";
import { albumDateLabel, groupByAlbumDate } from "./album";

describe("album date grouping", () => {
  const now = new Date(2026, 8, 7, 15, 0, 0);

  it("labels today and yesterday like a phone album", () => {
    expect(albumDateLabel(new Date(2026, 8, 7, 9).toISOString(), now)).toBe("今天");
    expect(albumDateLabel(new Date(2026, 8, 6, 22).toISOString(), now)).toBe("昨天");
    expect(albumDateLabel(new Date(2026, 8, 5, 8).toISOString(), now)).toBe("2026年9月5日");
  });

  it("groups newest dates first when items are already newest-first", () => {
    const groups = groupByAlbumDate(
      [
        { created_at: new Date(2026, 8, 7, 12).toISOString() },
        { created_at: new Date(2026, 8, 7, 8).toISOString() },
        { created_at: new Date(2026, 8, 5, 8).toISOString() },
      ],
      now
    );
    expect(groups.map((g) => g.label)).toEqual(["今天", "2026年9月5日"]);
    expect(groups[0].items).toHaveLength(2);
  });
});

import { describe, expect, it } from "vitest";
import { formatTileLabel, groupByMonth, toAlbumTiles, type AlbumTile } from "./album";

const tile = (overrides: Partial<AlbumTile>): AlbumTile => ({
  id: "r",
  date: "2026-11-02",
  title: "기록",
  place: undefined,
  thumbUrl: undefined,
  ...overrides,
});

describe("groupByMonth", () => {
  it("최신 달부터 묶고, 달 안에서는 받은 순서(최신순)를 지킨다", () => {
    const months = groupByMonth([
      tile({ id: "a", date: "2026-11-02" }),
      tile({ id: "b", date: "2026-11-01" }),
      tile({ id: "c", date: "2026-10-31" }),
      tile({ id: "d", date: "2025-11-30" }),
    ]);
    expect(months.map(({ key, label, tiles }) => [key, label, tiles.map(({ id }) => id)])).toEqual([
      ["2026-11", "2026 · 11", ["a", "b"]],
      ["2026-10", "2026 · 10", ["c"]],
      ["2025-11", "2025 · 11", ["d"]],
    ]);
  });

  it("기록이 없으면 빈 배열이다", () => {
    expect(groupByMonth([])).toEqual([]);
  });
});

describe("formatTileLabel", () => {
  it("월.일과 장소를 가운뎃점으로 잇는다", () => {
    expect(formatTileLabel(tile({ date: "2026-11-02", place: "성수동" }))).toBe("11.02 · 성수동");
  });

  it("장소가 없으면 날짜만 쓴다", () => {
    expect(formatTileLabel(tile({ date: "2026-01-09" }))).toBe("01.09");
  });
});

describe("toAlbumTiles", () => {
  it("대표 사진 썸네일 경로에 서명 URL을 붙이고, 빈 장소는 undefined로 바꾼다", () => {
    const tiles = toAlbumTiles(
      [
        { id: "a", date: "2026-11-02", title: "산책", place: "성수동", cover: { thumb_path: "a/p_thumb.jpg" } },
        { id: "b", date: "2026-11-01", title: "카페", place: null, cover: null },
      ],
      [{ path: "a/p_thumb.jpg", signedUrl: "https://example.test/a" }],
    );
    expect(tiles).toEqual([
      { id: "a", date: "2026-11-02", title: "산책", place: "성수동", thumbUrl: "https://example.test/a" },
      { id: "b", date: "2026-11-01", title: "카페", place: undefined, thumbUrl: undefined },
    ]);
  });

  it("서명 URL을 받지 못한 사진은 썸네일 없이 둔다", () => {
    const [first] = toAlbumTiles(
      [{ id: "a", date: "2026-11-02", title: "산책", place: null, cover: { thumb_path: "a/p_thumb.jpg" } }],
      [{ path: "a/p_thumb.jpg", signedUrl: null }],
    );
    expect(first?.thumbUrl).toBeUndefined();
  });
});

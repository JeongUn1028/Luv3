import { describe, expect, it } from "vitest";
import { formatPeriodMonthDay, formatTileLabel, groupByMonth, toAlbumTiles, toTagSuggestions, type AlbumTile } from "./album";

const tile = (overrides: Partial<AlbumTile>): AlbumTile => ({
  id: "r",
  date: "2026-11-02",
  endDate: undefined,
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

describe("formatPeriodMonthDay", () => {
  it("하루짜리는 월.일만 쓴다", () => {
    expect(formatPeriodMonthDay({ date: "2026-11-02", endDate: undefined })).toBe("11.02");
  });

  it("같은 달 기간은 시작과 끝의 월.일을 잇는다", () => {
    expect(formatPeriodMonthDay({ date: "2026-11-01", endDate: "2026-11-03" })).toBe("11.01–11.03");
  });

  it("달이 바뀌는 기간도 같은 모양이다", () => {
    expect(formatPeriodMonthDay({ date: "2026-10-31", endDate: "2026-11-02" })).toBe("10.31–11.02");
  });

  it("해가 바뀌는 기간도 연도 없이 쓴다", () => {
    expect(formatPeriodMonthDay({ date: "2026-12-31", endDate: "2027-01-02" })).toBe("12.31–01.02");
  });
});

describe("formatTileLabel", () => {
  it("기간이면 기간과 장소를 가운뎃점으로 잇는다", () => {
    expect(formatTileLabel(tile({ date: "2026-11-01", endDate: "2026-11-03", place: "제주" }))).toBe("11.01–11.03 · 제주");
  });

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
        { id: "a", date: "2026-11-02", end_date: "2026-11-03", title: "산책", place: "성수동", cover: { thumb_path: "a/p_thumb.jpg" } },
        { id: "b", date: "2026-11-01", end_date: null, title: "카페", place: null, cover: null },
      ],
      [{ path: "a/p_thumb.jpg", signedUrl: "https://example.test/a" }],
    );
    expect(tiles).toEqual([
      { id: "a", date: "2026-11-02", endDate: "2026-11-03", title: "산책", place: "성수동", thumbUrl: "https://example.test/a" },
      { id: "b", date: "2026-11-01", endDate: undefined, title: "카페", place: undefined, thumbUrl: undefined },
    ]);
  });

  it("서명 URL을 받지 못한 사진은 썸네일 없이 둔다", () => {
    const [first] = toAlbumTiles(
      [{ id: "a", date: "2026-11-02", end_date: null, title: "산책", place: null, cover: { thumb_path: "a/p_thumb.jpg" } }],
      [{ path: "a/p_thumb.jpg", signedUrl: null }],
    );
    expect(first?.thumbUrl).toBeUndefined();
  });
});

describe("toTagSuggestions", () => {
  it("많이 쓴 순서로, 수가 같으면 가나다순으로 줄 세운다", () => {
    expect(toTagSuggestions([["카페"], ["여행", "카페"], ["산책"]])).toEqual(["카페", "산책", "여행"]);
  });

  it("태그가 없으면 빈 목록이다", () => {
    expect(toTagSuggestions([])).toEqual([]);
  });

  it("대소문자만 다른 태그는 하나로 세고 먼저 나온 글자를 쓴다", () => {
    expect(toTagSuggestions([["여행"], ["Cafe"], ["cafe"]])).toEqual(["Cafe", "여행"]);
  });
});

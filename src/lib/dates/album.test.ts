import { describe, expect, it } from "vitest";
import { formatPeriodMonthDay, groupByMonth, toAlbumTiles, toLatestRecord, toTagSuggestions, type AlbumRow, type AlbumTile } from "./album";

const tile = (overrides: Partial<AlbumTile>): AlbumTile => ({
  id: "r",
  date: "2026-11-02",
  endDate: undefined,
  title: "기록",
  thumbUrl: undefined,
  tags: [],
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

describe("toAlbumTiles", () => {
  const row: AlbumRow = {
    id: "a",
    date: "2026-11-02",
    end_date: null,
    title: "산책",
    tags: [],
    cover: null,
  };

  it("대표 사진 썸네일 경로에 서명 URL을 붙이고, 빈 끝 날짜는 undefined로 바꾼다", () => {
    const tiles = toAlbumTiles(
      [
        { ...row, id: "a", date: "2026-11-02", end_date: "2026-11-03", title: "산책", cover: { thumb_path: "a/p_thumb.jpg" } },
        { ...row, id: "b", date: "2026-11-01", title: "카페" },
      ],
      [{ path: "a/p_thumb.jpg", signedUrl: "https://example.test/a" }],
    );
    expect(tiles).toEqual([
      { id: "a", date: "2026-11-02", endDate: "2026-11-03", title: "산책", thumbUrl: "https://example.test/a", tags: [] },
      { id: "b", date: "2026-11-01", endDate: undefined, title: "카페", thumbUrl: undefined, tags: [] },
    ]);
  });

  it("서명 URL을 받지 못한 사진은 썸네일 없이 둔다", () => {
    const [first] = toAlbumTiles(
      [{ ...row, cover: { thumb_path: "a/p_thumb.jpg" } }],
      [{ path: "a/p_thumb.jpg", signedUrl: null }],
    );
    expect(first?.thumbUrl).toBeUndefined();
  });
});

describe("toTagSuggestions", () => {
  it("많이 쓴 순서로, 수가 같으면 가나다순으로 줄 세운다", () => {
    expect(
      toTagSuggestions([
        { tag: "여행", count: 1 },
        { tag: "카페", count: 2 },
        { tag: "산책", count: 1 },
      ]),
    ).toEqual(["카페", "산책", "여행"]);
  });

  it("태그가 없으면 빈 목록이다", () => {
    expect(toTagSuggestions([])).toEqual([]);
  });
});

describe("toLatestRecord", () => {
  const latestRow: AlbumRow = {
    id: "a",
    date: "2026-11-02",
    end_date: null,
    title: "산책",
    tags: [],
    cover: { thumb_path: "a/p_thumb.jpg" },
  };

  // 홈은 휴대폰이 썸네일 주소를 경로로 기억해 다시 쓴다(#219)
  it("가장 최근 기록에 썸네일의 경로·주소·만료 시각을 붙인다", () => {
    const record = toLatestRecord([latestRow], [{ path: "a/p_thumb.jpg", signedUrl: "https://example.test/a", expiresAt: 1000 }]);

    expect(record).toMatchObject({ id: "a", title: "산책", thumb: { path: "a/p_thumb.jpg", url: "https://example.test/a", expiresAt: 1000 } });
  });

  it("대표 사진이 없거나 서명하지 못했으면 썸네일이 없고, 기록이 없으면 undefined다", () => {
    expect(toLatestRecord([{ ...latestRow, cover: null }], [])?.thumb).toBeUndefined();
    expect(toLatestRecord([latestRow], [{ path: "a/p_thumb.jpg", signedUrl: null, expiresAt: undefined }])?.thumb).toBeUndefined();
    expect(toLatestRecord([], [])).toBeUndefined();
  });
});

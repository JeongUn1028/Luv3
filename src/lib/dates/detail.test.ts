import { describe, expect, it } from "vitest";
import { formatRecordDate, isRecordId, toDateRecordDetail, type DetailRow } from "./detail";

const row: DetailRow = {
  id: "r1",
  date: "2026-11-02",
  title: "산책",
  place: null,
  memo: "오래 걸었다",
  photos: [
    { id: "p2", path: "r1/p2.jpg", caption: null, sort_order: 1 },
    { id: "p1", path: "r1/p1.jpg", caption: "카페", sort_order: 0 },
  ],
};

describe("isRecordId", () => {
  it("UUID 형식만 기록 id로 받는다", () => {
    expect(isRecordId("5a87e560-6a6e-49be-8af3-db196468143c")).toBe(true);
    expect(isRecordId("5A87E560-6A6E-49BE-8AF3-DB196468143C")).toBe(true);
    expect(isRecordId("not-a-uuid")).toBe(false);
    expect(isRecordId("5a87e560-6a6e-49be-8af3-db196468143c/../x")).toBe(false);
  });
});

describe("toDateRecordDetail", () => {
  it("사진을 순서대로 정렬하고 원본 서명 URL을 붙이며, DB의 null은 undefined로 바꾼다", () => {
    const detail = toDateRecordDetail(row, [
      { path: "r1/p1.jpg", signedUrl: "https://example.test/p1" },
      { path: "r1/p2.jpg", signedUrl: "https://example.test/p2" },
    ]);
    expect(detail).toEqual({
      id: "r1",
      date: "2026-11-02",
      title: "산책",
      place: undefined,
      memo: "오래 걸었다",
      photos: [
        { id: "p1", url: "https://example.test/p1", caption: "카페" },
        { id: "p2", url: "https://example.test/p2", caption: undefined },
      ],
    });
  });

  it("서명 URL을 받지 못한 사진은 URL 없이 둔다", () => {
    const detail = toDateRecordDetail(row, [{ path: "r1/p1.jpg", signedUrl: null }]);
    expect(detail.photos.map(({ url }) => url)).toEqual([undefined, undefined]);
  });
});

describe("formatRecordDate", () => {
  it("YYYY.MM.DD와 요일로 쓴다", () => {
    expect(formatRecordDate("2026-11-02")).toBe("2026.11.02 월요일");
    expect(formatRecordDate("2025-12-24")).toBe("2025.12.24 수요일");
  });
});

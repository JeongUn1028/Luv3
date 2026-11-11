import { describe, expect, it } from "vitest";
import { parseRecordSearchPage, parseRecordSearchParams, RecordSearchError, toRecordSearchApiHref, toSearchWords, type RecordCursor } from "./search-api";

const CURSOR: RecordCursor = { date: "2026-11-02", createdAt: "2026-11-02T03:04:05.123456+00:00", id: "5a87e560-6a6e-49be-8af3-db196468143c" };

const TILE = { id: "a", date: "2026-11-02", title: "산책", tags: ["카페"], thumbUrl: "https://example.test/a" };

describe("toSearchWords", () => {
  it("띄어 쓴 낱말로 나누고 소문자로 바꾸며, 태그처럼 쓴 앞의 #은 뺀다", () => {
    expect(toSearchWords("  #카페   Han  ")).toEqual(["카페", "han"]);
  });

  it("빈칸이나 #만 있으면 낱말이 없다", () => {
    expect(toSearchWords("  # ")).toEqual([]);
  });
});

describe("toRecordSearchApiHref", () => {
  it("빈 검색어와 태그는 주소에 넣지 않는다", () => {
    expect(toRecordSearchApiHref({ query: "  ", tag: undefined, after: undefined })).toBe("/api/records/search?");
  });

  it("주소로 만든 조건을 다시 읽으면 같은 조건이다", () => {
    // Arrange
    const params = { query: "성수 카페", tag: "데이트", after: CURSOR };

    // Act
    const href = toRecordSearchApiHref(params);

    // Assert
    expect(parseRecordSearchParams(new URL(href, "http://localhost").searchParams)).toEqual(params);
  });
});

describe("parseRecordSearchParams", () => {
  const parse = (search: string) => parseRecordSearchParams(new URLSearchParams(search));

  it("아무것도 없으면 모든 기록의 첫 묶음이다", () => {
    expect(parse("")).toEqual({ query: "", tag: undefined, after: undefined });
  });

  it("검색어나 태그가 100자를 넘으면 받지 않는다", () => {
    expect(parse(`q=${"가".repeat(100)}`)).toBeDefined();
    expect(parse(`q=${"가".repeat(101)}`)).toBeUndefined();
    expect(parse(`tag=${"가".repeat(101)}`)).toBeUndefined();
  });

  it("다음 자리가 하나라도 빠지거나 모양이 틀리면 받지 않는다", () => {
    expect(parse(`beforeDate=${CURSOR.date}&beforeId=${CURSOR.id}`)).toBeUndefined();
    expect(parse(`beforeDate=2026-11&beforeCreatedAt=${encodeURIComponent(CURSOR.createdAt)}&beforeId=${CURSOR.id}`)).toBeUndefined();
    expect(parse(`beforeDate=${CURSOR.date}&beforeCreatedAt=어제&beforeId=${CURSOR.id}`)).toBeUndefined();
    expect(parse(`beforeDate=${CURSOR.date}&beforeCreatedAt=${encodeURIComponent(CURSOR.createdAt)}&beforeId=1`)).toBeUndefined();
  });
});

describe("parseRecordSearchPage", () => {
  it("빠진 칸은 undefined로 읽고 다음 자리를 그대로 둔다", () => {
    expect(parseRecordSearchPage({ items: [TILE], total: 61, next: CURSOR, loadedAt: 1 })).toEqual({
      items: [TILE],
      total: 61,
      next: CURSOR,
      loadedAt: 1,
    });
  });

  it("다음 자리가 없으면 마지막 묶음이다", () => {
    expect(parseRecordSearchPage({ items: [], total: 0, loadedAt: 1 }).next).toBeUndefined();
  });

  it("모양이 다르면 찾기 실패로 본다", () => {
    expect(() => parseRecordSearchPage({ items: [{ ...TILE, tags: [1] }], total: 1, loadedAt: 1 })).toThrow(RecordSearchError);
    expect(() => parseRecordSearchPage({ items: [], total: "0", loadedAt: 1 })).toThrow(RecordSearchError);
    expect(() => parseRecordSearchPage({ items: [], total: 0, next: { date: "2026-11-02" }, loadedAt: 1 })).toThrow(RecordSearchError);
    expect(() => parseRecordSearchPage({ items: [], total: 0 })).toThrow(RecordSearchError);
    expect(() => parseRecordSearchPage("<html>")).toThrow(RecordSearchError);
  });
});

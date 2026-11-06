import { describe, expect, it } from "vitest";
import type { AlbumTile } from "./album";
import { filterAlbumTiles, parseRecordFilter, toRecordSearchHref } from "./search";

const tile = (overrides: Partial<AlbumTile>): AlbumTile => ({
  id: "r",
  date: "2026-11-02",
  endDate: undefined,
  title: "기록",
  place: undefined,
  thumbUrl: undefined,
  tags: [],
  searchText: "",
  ...overrides,
});

describe("filterAlbumTiles", () => {
  const seongsu = tile({ id: "a", tags: ["카페"], searchText: "성수 산책\n성수동\n오래 걸었다\n카페" });
  const hangang = tile({ id: "b", tags: ["Picnic"], searchText: "한강 소풍\n돗자리를 폈다\npicnic" });
  const tiles = [seongsu, hangang];

  it("검색어와 태그가 없으면 받은 그대로 돌려준다", () => {
    expect(filterAlbumTiles(tiles, { query: "  ", tag: undefined })).toEqual(tiles);
  });

  it("검색어가 담긴 기록만 받은 순서대로 돌려준다", () => {
    expect(filterAlbumTiles(tiles, { query: "걸었다", tag: undefined })).toEqual([seongsu]);
  });

  it("띄어 쓴 낱말은 모두 담긴 기록만 찾는다", () => {
    expect(filterAlbumTiles(tiles, { query: "성수  걸었다", tag: undefined })).toEqual([seongsu]);
    expect(filterAlbumTiles(tiles, { query: "성수 돗자리", tag: undefined })).toEqual([]);
  });

  it("영어는 대소문자를 가리지 않고 찾는다", () => {
    expect(filterAlbumTiles(tiles, { query: "PICNIC", tag: undefined })).toEqual([hangang]);
  });

  it("검색어 앞의 #은 지우고 찾는다", () => {
    expect(filterAlbumTiles(tiles, { query: "#카페", tag: undefined })).toEqual([seongsu]);
  });

  it("태그는 대소문자를 가리지 않고 글자가 같아야 고른다", () => {
    expect(filterAlbumTiles(tiles, { query: "", tag: "picnic" })).toEqual([hangang]);
    expect(filterAlbumTiles(tiles, { query: "", tag: "카" })).toEqual([]);
  });

  it("검색어와 태그를 함께 주면 둘 다 맞는 기록만 찾는다", () => {
    expect(filterAlbumTiles(tiles, { query: "성수", tag: "카페" })).toEqual([seongsu]);
    expect(filterAlbumTiles(tiles, { query: "한강", tag: "카페" })).toEqual([]);
  });
});

describe("parseRecordFilter", () => {
  it("아무것도 없으면 닫혀 있다", () => {
    expect(parseRecordFilter(new URLSearchParams(""))).toEqual({ isOpen: false, tag: undefined });
  });

  it("찾기 표시가 있으면 열려 있다", () => {
    expect(parseRecordFilter(new URLSearchParams("search=1"))).toEqual({ isOpen: true, tag: undefined });
  });

  it("찾기 표시와 함께 있는 태그를 읽는다", () => {
    expect(parseRecordFilter(new URLSearchParams("search=1&tag=%EC%B9%B4%ED%8E%98"))).toEqual({ isOpen: true, tag: "카페" });
  });

  it("빈 태그는 없는 것으로 친다", () => {
    expect(parseRecordFilter(new URLSearchParams("search=1&tag="))).toEqual({ isOpen: true, tag: undefined });
  });
});

describe("toRecordSearchHref", () => {
  it("태그 없이 찾기를 연 주소를 만든다", () => {
    expect(toRecordSearchHref()).toBe("/records?search=1");
  });

  it("태그를 주소에 맞게 바꿔 넣는다", () => {
    const href = toRecordSearchHref("한강 & 산책");
    expect(parseRecordFilter(new URL(href, "https://a.test").searchParams)).toEqual({ isOpen: true, tag: "한강 & 산책" });
  });
});

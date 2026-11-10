import { describe, expect, it } from "vitest";
import { parseRecordFilter, toRecordSearchHref } from "./search";

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

import { describe, expect, it } from "vitest";
import { buildHomeViewSearch, getViewFromScroll, parseHomeView } from "./view";

describe("parseHomeView", () => {
  it("calendar면 캘린더 페이지를 연다", () => {
    expect(parseHomeView("calendar")).toBe("calendar");
  });

  it("값이 없거나 모르는 값이면 기록 페이지를 연다", () => {
    expect(parseHomeView(null)).toBe("records");
    expect(parseHomeView(undefined)).toBe("records");
    expect(parseHomeView("records")).toBe("records");
    expect(parseHomeView("settings")).toBe("records");
    expect(parseHomeView(["calendar"])).toBe("records");
  });
});

describe("buildHomeViewSearch", () => {
  it("캘린더로 바꾸면 view=calendar를 붙인다", () => {
    expect(buildHomeViewSearch("calendar", "")).toBe("?view=calendar");
  });

  it("기록으로 돌아오면 view를 지워 주소를 깔끔하게 둔다", () => {
    expect(buildHomeViewSearch("records", "?view=calendar")).toBe("");
  });

  it("다른 쿼리는 그대로 둔다", () => {
    expect(buildHomeViewSearch("calendar", "?from=next")).toBe("?from=next&view=calendar");
    expect(buildHomeViewSearch("records", "?from=next&view=calendar")).toBe("?from=next");
  });
});

describe("getViewFromScroll", () => {
  it("절반을 넘게 밀면 캘린더, 그 전이면 기록으로 본다", () => {
    expect(getViewFromScroll(0, 390)).toBe("records");
    expect(getViewFromScroll(194, 390)).toBe("records");
    expect(getViewFromScroll(196, 390)).toBe("calendar");
    expect(getViewFromScroll(390, 390)).toBe("calendar");
  });

  it("끝을 넘겨 튕기는 스크롤 값도 양 끝 페이지로 본다", () => {
    expect(getViewFromScroll(-30, 390)).toBe("records");
    expect(getViewFromScroll(450, 390)).toBe("calendar");
  });

  it("폭을 아직 모르면 기록으로 본다", () => {
    expect(getViewFromScroll(100, 0)).toBe("records");
  });
});

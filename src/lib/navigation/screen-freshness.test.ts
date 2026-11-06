import { beforeEach, describe, expect, it } from "vitest";
import { copyScreenLoaded, isScreenStale, markAllScreensLoaded, markAllScreensStale, markScreenLoaded, STALE_AFTER_MS } from "./screen-freshness";

const BASE_URL = "https://luv3.test/somewhere";
const LOADED_AT = 1_000_000;

describe("isScreenStale", () => {
  beforeEach(() => {
    markAllScreensStale();
  });

  it("언제 받았는지 모르는 화면은 오래된 것으로 본다", () => {
    expect(isScreenStale("/records", BASE_URL, LOADED_AT)).toBe(true);
  });

  it("주소만 바꾼 화면은 처음 받은 때를 이어 받는다", () => {
    markScreenLoaded("/records", BASE_URL, LOADED_AT);

    copyScreenLoaded("/records", "/records?search=1", BASE_URL);

    expect(isScreenStale("/records?search=1", BASE_URL, LOADED_AT + STALE_AFTER_MS - 1)).toBe(false);
    expect(isScreenStale("/records?search=1", BASE_URL, LOADED_AT + STALE_AFTER_MS)).toBe(true);
  });

  it("언제 받았는지 모르는 화면의 주소를 바꿔도 오래된 것으로 본다", () => {
    copyScreenLoaded("/records", "/records?search=1", BASE_URL);

    expect(isScreenStale("/records?search=1", BASE_URL, LOADED_AT)).toBe(true);
  });

  it("받은 지 30초가 안 됐으면 새로 불러오지 않는다", () => {
    markScreenLoaded("/records", BASE_URL, LOADED_AT);

    expect(isScreenStale("/records", BASE_URL, LOADED_AT + STALE_AFTER_MS - 1)).toBe(false);
  });

  it("받은 지 30초가 지나면 새로 불러온다", () => {
    markScreenLoaded("/records", BASE_URL, LOADED_AT);

    expect(isScreenStale("/records", BASE_URL, LOADED_AT + STALE_AFTER_MS)).toBe(true);
  });

  it("상대 주소로 적고 전체 주소로 물어도 같은 화면으로 본다", () => {
    markScreenLoaded("/records", BASE_URL, LOADED_AT);

    expect(isScreenStale("https://luv3.test/records", BASE_URL, LOADED_AT + 1)).toBe(false);
  });

  it("쿼리가 다르면 다른 화면으로 본다", () => {
    markScreenLoaded("/calendar?month=2026-10", BASE_URL, LOADED_AT);

    expect(isScreenStale("/calendar", BASE_URL, LOADED_AT + 1)).toBe(true);
  });

  it("다시 받으면 시간을 새로 잰다", () => {
    markScreenLoaded("/records", BASE_URL, LOADED_AT);
    markScreenLoaded("/records", BASE_URL, LOADED_AT + STALE_AFTER_MS);

    expect(isScreenStale("/records", BASE_URL, LOADED_AT + STALE_AFTER_MS + 1)).toBe(false);
  });

  it("숨겨 둔 화면까지 새로 받게 되면 본 화면을 모두 방금 받은 것으로 친다", () => {
    markScreenLoaded("/records", BASE_URL, LOADED_AT);
    markScreenLoaded("/dates/1", BASE_URL, LOADED_AT);

    markAllScreensLoaded(LOADED_AT + STALE_AFTER_MS);

    expect(isScreenStale("/records", BASE_URL, LOADED_AT + STALE_AFTER_MS + 1)).toBe(false);
    expect(isScreenStale("/dates/1", BASE_URL, LOADED_AT + STALE_AFTER_MS + 1)).toBe(false);
  });

  it("모두 오래된 것으로 치면 방금 받은 화면도 새로 불러온다", () => {
    markScreenLoaded("/records", BASE_URL, LOADED_AT);

    markAllScreensStale();

    expect(isScreenStale("/records", BASE_URL, LOADED_AT + 1)).toBe(true);
  });
});

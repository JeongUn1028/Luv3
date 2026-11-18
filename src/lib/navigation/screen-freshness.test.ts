import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { HOME_PATH } from "@/lib/auth/paths";
import { CALENDAR_PATH } from "@/lib/calendar/month";
import { RECORDS_PATH } from "@/lib/dates/album";
import { TODOS_PATH } from "@/lib/todos/list";
import {
  copyScreenLoaded,
  getScreenLoadedAt,
  isScreenStale,
  markAllScreensLoaded,
  markAllScreensStale,
  markScreenLoaded,
  markScreenOpened,
  REUSED_SCREEN_PATHS,
  STALE_AFTER_MS,
} from "./screen-freshness";

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

  it("화면을 언제 받았는지 알려 주고, 모르면 알려 주지 않는다", () => {
    markScreenLoaded("/records", BASE_URL, LOADED_AT);

    expect(getScreenLoadedAt("https://luv3.test/records", BASE_URL)).toBe(LOADED_AT);
    expect(getScreenLoadedAt("/calendar", BASE_URL)).toBeUndefined();
  });

  it("모두 오래된 것으로 치면 방금 받은 화면도 새로 불러온다", () => {
    markScreenLoaded("/records", BASE_URL, LOADED_AT);

    markAllScreensStale();

    expect(isScreenStale("/records", BASE_URL, LOADED_AT + 1)).toBe(true);
  });

  it("모두 오래된 것으로 친 화면은 언제 받았는지 알려 주지 않는다", () => {
    markScreenLoaded("/records", BASE_URL, LOADED_AT);

    markAllScreensStale();

    expect(getScreenLoadedAt("/records", BASE_URL)).toBeUndefined();
  });
});

// 링크로 옮기면 Next는 받은 지 30초가 안 된 탭 화면을 서버에 묻지 않고 받아 둔 내용으로 그린다(탭 화면의 unstable_dynamicStaleTime, #405)
describe("markScreenOpened", () => {
  // 받은 때는 테스트 사이에도 남으므로, 테스트마다 앞 테스트보다 30초 넘게 뒤에서 시작한다
  let openedAt = LOADED_AT;
  beforeEach(() => {
    markAllScreensStale();
    openedAt += 10 * STALE_AFTER_MS;
  });

  it("처음 여는 화면은 방금 받은 것으로 적고 따로 새로 받게 하지 않는다", () => {
    const shouldRefresh = markScreenOpened("/records", BASE_URL, openedAt);

    expect(shouldRefresh).toBe(false);
    expect(getScreenLoadedAt("/records", BASE_URL)).toBe(openedAt);
  });

  it("30초 안에 다시 열면 받아 둔 내용을 쓰므로 받은 때를 늘리지 않는다", () => {
    markScreenOpened("/records", BASE_URL, openedAt);

    const shouldRefresh = markScreenOpened("/records", BASE_URL, openedAt + STALE_AFTER_MS - 1);

    expect(shouldRefresh).toBe(false);
    expect(isScreenStale("/records", BASE_URL, openedAt + STALE_AFTER_MS)).toBe(true);
  });

  it("30초가 지나 다시 열면 서버에서 새로 받으므로 시간을 새로 잰다", () => {
    markScreenOpened("/records", BASE_URL, openedAt);

    const shouldRefresh = markScreenOpened("/records", BASE_URL, openedAt + STALE_AFTER_MS);

    expect(shouldRefresh).toBe(false);
    expect(getScreenLoadedAt("/records", BASE_URL)).toBe(openedAt + STALE_AFTER_MS);
  });

  // 폼을 쓰는 동안 다른 저장이 끝나 새로 받기를 미뤘으면(#164) 받아 둔 내용은 저장 전의 것이다
  it("모두 오래된 것으로 친 뒤 30초 안에 다시 열면 받아 둔 옛 내용이 보이므로 도착한 뒤 새로 받게 한다", () => {
    markScreenOpened("/records", BASE_URL, openedAt);
    markAllScreensStale();

    const shouldRefresh = markScreenOpened("/records", BASE_URL, openedAt + 1);

    expect(shouldRefresh).toBe(true);
    expect(isScreenStale("/records", BASE_URL, openedAt + 1)).toBe(true);
  });

  it("모두 오래된 것으로 쳤어도 받은 지 30초가 지난 화면은 서버에서 새로 받으므로 따로 받지 않는다", () => {
    markScreenOpened("/records", BASE_URL, openedAt);
    markAllScreensStale();

    const shouldRefresh = markScreenOpened("/records", BASE_URL, openedAt + STALE_AFTER_MS);

    expect(shouldRefresh).toBe(false);
    expect(isScreenStale("/records", BASE_URL, openedAt + STALE_AFTER_MS + 1)).toBe(false);
  });

  it("탭이 아닌 화면은 30초 안에 다시 열어도 서버에서 새로 받으므로 시간을 새로 잰다", () => {
    markScreenOpened("/dates/1", BASE_URL, openedAt);
    markAllScreensStale();

    const shouldRefresh = markScreenOpened("/dates/1", BASE_URL, openedAt + 1);

    expect(shouldRefresh).toBe(false);
    expect(getScreenLoadedAt("/dates/1", BASE_URL)).toBe(openedAt + 1);
  });

  it("다른 달을 보는 캘린더처럼 쿼리가 붙은 탭 화면도 받아 둔 내용을 쓴다", () => {
    markScreenOpened("/calendar?month=2026-10", BASE_URL, openedAt);

    markScreenOpened("/calendar?month=2026-10", BASE_URL, openedAt + 1);

    expect(getScreenLoadedAt("/calendar?month=2026-10", BASE_URL)).toBe(openedAt);
  });

  it("새로 받은 뒤에는 다시 열어도 따로 새로 받게 하지 않는다", () => {
    markScreenOpened("/records", BASE_URL, openedAt);
    markAllScreensStale();
    markAllScreensLoaded(openedAt + 1);

    expect(markScreenOpened("/records", BASE_URL, openedAt + 2)).toBe(false);
  });
});

describe("REUSED_SCREEN_PATHS", () => {
  it("하단 탭 네 화면이고, 화면 파일이 같은 시간을 Next에 알린다", () => {
    expect([...REUSED_SCREEN_PATHS]).toEqual([HOME_PATH, RECORDS_PATH, CALENDAR_PATH, TODOS_PATH]);
    for (const file of ["src/app/page.tsx", "src/app/records/page.tsx", "src/app/calendar/page.tsx", "src/app/todos/page.tsx"]) {
      expect(readFileSync(file, "utf8"), file).toContain(`export const unstable_dynamicStaleTime = ${STALE_AFTER_MS / 1000};`);
    }
  });
});

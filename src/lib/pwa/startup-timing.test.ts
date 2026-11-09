import { describe, expect, it } from "vitest";
import {
  appendStartupTiming,
  describeStylesheets,
  formatMeasuredAt,
  formatSeconds,
  isAppLaunch,
  parseStartupTimings,
  STARTUP_TIMING_LIMIT,
  toStartupTiming,
  type StartupTiming,
  type StartupTimingSource,
} from "./startup-timing";

const createSource = (overrides: Partial<StartupTimingSource> = {}): StartupTimingSource => ({
  navigation: {
    redirectStart: 0,
    redirectEnd: 0,
    fetchStart: 30,
    domainLookupStart: 40,
    connectEnd: 140,
    requestStart: 150,
    responseStart: 950,
    responseEnd: 1000,
  },
  firstContentfulPaint: 1400,
  stylesheets: [
    { startTime: 1010, responseEnd: 1300, transferSize: 39_000, decodedBodySize: 300_000 },
    { startTime: 1010, responseEnd: 1250, transferSize: 0, decodedBodySize: 20_000 },
  ],
  measuredAt: "2026-11-09T01:00:00.000Z",
  path: "/",
  isStandalone: true,
  ...overrides,
});

const createTiming = (measuredAt: string): StartupTiming => ({ ...toStartupTiming(createSource()), measuredAt });

describe("isAppLaunch", () => {
  it("이전 페이지 없이 새로 열면 앱을 켠 것으로 본다", () => {
    expect(isAppLaunch({ type: "navigate", referrer: "", origin: "https://luv3.app" })).toBe(true);
  });

  it("같은 사이트에서 문서를 새로 받으면 앱 안 이동으로 본다", () => {
    expect(isAppLaunch({ type: "navigate", referrer: "https://luv3.app/login", origin: "https://luv3.app" })).toBe(false);
  });

  it("뒤로·앞으로 가기면 앱을 켠 것으로 보지 않는다", () => {
    expect(isAppLaunch({ type: "back_forward", referrer: "", origin: "https://luv3.app" })).toBe(false);
  });

  it("새로 고침이면 시작 화면이 나오므로 앱을 켠 것으로 센다", () => {
    // 아이폰이 쉬던 홈 화면 앱을 다시 띄울 때도 새로 고침으로 온다
    expect(isAppLaunch({ type: "reload", referrer: "https://luv3.app/", origin: "https://luv3.app" })).toBe(true);
  });

  it("다른 사이트에서 넘어오면 앱을 켠 것으로 본다", () => {
    expect(isAppLaunch({ type: "navigate", referrer: "https://kakao.com/", origin: "https://luv3.app" })).toBe(true);
  });

  it("이전 주소를 읽을 수 없으면 앱을 켠 것으로 본다", () => {
    expect(isAppLaunch({ type: "navigate", referrer: "잘못된 주소", origin: "https://luv3.app" })).toBe(true);
  });
});

describe("toStartupTiming", () => {
  it("문서 요청 시각으로 단계별 시간을 나눈다", () => {
    expect(toStartupTiming(createSource())).toEqual({
      measuredAt: "2026-11-09T01:00:00.000Z",
      path: "/",
      isStandalone: true,
      beforeFetchMs: 30,
      redirectMs: 0,
      connectMs: 100,
      serverMs: 800,
      firstPaintMs: 1400,
      stylesheetEndMs: 1300,
      stylesheetDownloadCount: 1,
      stylesheetCount: 2,
    });
  });

  it("로그인 화면으로 넘겨지면 넘겨진 시간을 따로 세고 시작 전 시간에 넣지 않는다", () => {
    const source = createSource();

    const timing = toStartupTiming({ ...source, navigation: { ...source.navigation, redirectStart: 0, redirectEnd: 400, fetchStart: 410 } });

    expect(timing.redirectMs).toBe(400);
    expect(timing.beforeFetchMs).toBe(10);
  });

  it("이미 연결돼 있어 연결 단계가 없으면 연결 시간은 0이다", () => {
    const source = createSource();

    expect(toStartupTiming({ ...source, navigation: { ...source.navigation, domainLookupStart: 30, connectEnd: 30 } }).connectMs).toBe(0);
  });

  it("첫 그림 시각을 모르면 비워 둔다", () => {
    expect(toStartupTiming(createSource({ firstContentfulPaint: undefined })).firstPaintMs).toBeUndefined();
  });

  it("첫 그림 뒤에 요청한 CSS는 세지 않는다", () => {
    const source = createSource();
    const laterStylesheet = { startTime: 3000, responseEnd: 3200, transferSize: 5000, decodedBodySize: 20_000 };

    expect(toStartupTiming({ ...source, stylesheets: [...source.stylesheets, laterStylesheet] })).toMatchObject({
      stylesheetEndMs: 1300,
      stylesheetDownloadCount: 1,
      stylesheetCount: 2,
    });
  });

  it("브라우저가 CSS 크기를 알려 주지 않으면 새로 받은 수를 비워 둔다", () => {
    // 크기를 모르면 받은 크기도 0으로 와서, 저장해 둔 것을 쓴 것처럼 보인다
    const unknown = { startTime: 1010, responseEnd: 1300, transferSize: 0, decodedBodySize: 0 };

    expect(toStartupTiming(createSource({ stylesheets: [unknown] })).stylesheetDownloadCount).toBeUndefined();
  });

  it("CSS 기록이 없으면 끝 시각을 비우고 0개로 센다", () => {
    expect(toStartupTiming(createSource({ stylesheets: [] }))).toMatchObject({
      stylesheetEndMs: undefined,
      stylesheetDownloadCount: 0,
      stylesheetCount: 0,
    });
  });

  it("시간은 1ms 단위로 반올림한다", () => {
    const source = createSource();

    expect(toStartupTiming({ ...source, navigation: { ...source.navigation, requestStart: 150.4, responseStart: 950.9 } }).serverMs).toBe(801);
  });
});

describe("appendStartupTiming", () => {
  it("새 기록을 맨 앞에 넣는다", () => {
    const older = createTiming("2026-11-09T00:00:00.000Z");
    const newer = createTiming("2026-11-09T01:00:00.000Z");

    expect(appendStartupTiming([older], newer)).toEqual([newer, older]);
  });

  it("정해진 수를 넘으면 가장 오래된 기록부터 버린다", () => {
    const timings = Array.from({ length: STARTUP_TIMING_LIMIT }, (_, index) => createTiming(`2026-11-0${String(index % 9)}T00:00:00.000Z`));
    const newest = createTiming("2026-11-10T00:00:00.000Z");

    const result = appendStartupTiming(timings, newest);

    expect(result).toHaveLength(STARTUP_TIMING_LIMIT);
    expect(result[0]).toBe(newest);
    expect(result.at(-1)).toBe(timings.at(-2));
  });
});

describe("parseStartupTimings", () => {
  it("저장한 기록을 그대로 읽는다", () => {
    const timings = [createTiming("2026-11-09T01:00:00.000Z")];

    expect(parseStartupTimings(JSON.stringify(timings))).toEqual(timings);
  });

  it("저장한 것이 없거나 읽을 수 없으면 빈 목록이다", () => {
    expect(parseStartupTimings(null)).toEqual([]);
    expect(parseStartupTimings("{깨진")).toEqual([]);
    expect(parseStartupTimings('{"measuredAt":"x"}')).toEqual([]);
  });

  it("잰 시각이 날짜가 아니면 빼고 읽는다", () => {
    // 날짜로 바꿀 수 없는 값을 그리면 시각을 쓰다 오류가 나 설정 화면 전체가 깨진다
    const timing = createTiming("2026-11-09T01:00:00.000Z");

    expect(parseStartupTimings(JSON.stringify([timing, { ...timing, measuredAt: "x" }]))).toEqual([timing]);
  });

  it("모양이 다른 기록은 빼고 읽는다", () => {
    const timing = createTiming("2026-11-09T01:00:00.000Z");

    expect(parseStartupTimings(JSON.stringify([timing, { measuredAt: 1 }, "문자"]))).toEqual([timing]);
  });
});

describe("formatSeconds", () => {
  it("ms를 둘째 자리까지 초로 쓴다", () => {
    expect(formatSeconds(1400)).toBe("1.40초");
    expect(formatSeconds(0)).toBe("0.00초");
  });

  it("시간을 모르면 물음표로 쓴다", () => {
    expect(formatSeconds(undefined)).toBe("?");
  });
});

describe("formatMeasuredAt", () => {
  it("기기 시간대와 상관없이 한국 시간으로 쓴다", () => {
    expect(formatMeasuredAt("2026-11-08T23:05:07.000Z")).toBe("11. 9. 08:05:07");
  });
});

describe("describeStylesheets", () => {
  it("새로 받은 CSS 수와 끝난 시각을 쓴다", () => {
    expect(describeStylesheets({ stylesheetDownloadCount: 1, stylesheetCount: 2, stylesheetEndMs: 1300 })).toBe("CSS 2개 중 1개 새로 받음, 1.30초에 끝");
  });

  it("새로 받았는지 모르면 모른다고 쓴다", () => {
    expect(describeStylesheets({ stylesheetDownloadCount: undefined, stylesheetCount: 1, stylesheetEndMs: 900 })).toBe("CSS 1개 중 새로 받았는지 모름, 0.90초에 끝");
  });

  it("CSS 기록이 없으면 없다고 쓴다", () => {
    expect(describeStylesheets({ stylesheetDownloadCount: 0, stylesheetCount: 0, stylesheetEndMs: undefined })).toBe("CSS 기록 없음");
  });
});

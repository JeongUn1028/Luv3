import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchHolidays, getHolidayNamesInRange, getHolidays, resetHolidayState, toServiceKey } from "./server";

vi.mock("server-only", () => ({}));

const toBody = (items: unknown, totalCount: number) => ({
  response: { header: { resultCode: "00", resultMsg: "NORMAL SERVICE." }, body: { items, numOfRows: 100, pageNo: 1, totalCount } },
});
const toItem = (locdate: number, dateName: string) => ({ dateKind: "01", dateName, isHoliday: "Y", locdate, seq: 1 });

describe("toServiceKey", () => {
  it("인코딩된 키는 원래 키로 풀고, 원래 키는 그대로 쓴다", () => {
    expect(toServiceKey("ab%2Bc%2Fd%3D%3D")).toBe("ab+c/d==");
    expect(toServiceKey("ab+c/d==")).toBe("ab+c/d==");
  });

  it("풀 수 없는 키는 그대로 쓴다", () => {
    expect(toServiceKey("ab%zz")).toBe("ab%zz");
  });
});

describe("fetchHolidays", () => {
  it("해의 공휴일을 한 번에 받도록 원래 키로 묻고 하루 동안 저장해 두게 한다", async () => {
    // Arrange
    const fetcher = vi.fn(async () => Response.json(toBody({ item: toItem(20260505, "어린이날") }, 1)));

    // Act
    const holidays = await fetchHolidays({ year: 2026, apiKey: "ab%2Bc", fetcher });

    // Assert
    expect(holidays).toEqual([{ date: "2026-05-05", name: "어린이날" }]);
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit & { next?: { revalidate?: number } }];
    const { origin, pathname, searchParams } = new URL(url);
    expect(`${origin}${pathname}`).toBe("https://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getRestDeInfo");
    expect(Object.fromEntries(searchParams)).toEqual({ serviceKey: "ab+c", solYear: "2026", numOfRows: "100", _type: "json" });
    expect(init).toMatchObject({ cache: "force-cache", next: { revalidate: 86400 } });
  });

  it("키가 틀려 거절되면 상태 코드를 담아 실패로 알린다", async () => {
    // Arrange
    const fetcher = vi.fn(async () => new Response("{}", { status: 403 }));

    // Act & Assert
    await expect(fetchHolidays({ year: 2026, apiKey: "틀림", fetcher })).rejects.toMatchObject({ name: "HolidayLoadError", status: 403 });
  });

  it("연결이 끊기거나 응답이 JSON이 아니면 실패로 알린다", async () => {
    // Arrange
    const offline = vi.fn(async () => Promise.reject(new TypeError("fetch failed")));
    const xml = vi.fn(async () => new Response("<xml/>"));

    // Act & Assert
    await expect(fetchHolidays({ year: 2026, apiKey: "키", fetcher: offline })).rejects.toMatchObject({ name: "HolidayLoadError" });
    await expect(fetchHolidays({ year: 2026, apiKey: "키", fetcher: xml })).rejects.toMatchObject({ name: "HolidayLoadError" });
  });
});

describe("getHolidays", () => {
  beforeEach(() => {
    resetHolidayState();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("키가 없으면 외부 API를 부르지 않고 공휴일 없이 두며 한 번만 알린다", async () => {
    // Arrange
    vi.stubEnv("HOLIDAY_API_KEY", "");
    const fetcher = vi.fn<typeof fetch>();

    // Act
    const holidays = await getHolidays(2026, { fetcher });
    await getHolidays(2027, { fetcher });

    // Assert
    expect(holidays).toEqual([]);
    expect(fetcher).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledTimes(1);
  });

  it("받지 못하면 undefined를 돌려주고 키 없이 원인을 로그에 남긴다", async () => {
    // Arrange
    vi.stubEnv("HOLIDAY_API_KEY", "비밀키");
    const fetcher = vi.fn(async () => new Response("{}", { status: 500 }));

    // Act
    const holidays = await getHolidays(2026, { fetcher });

    // Assert
    expect(holidays).toBeUndefined();
    expect(console.error).toHaveBeenCalledWith("공휴일 조회 실패", expect.objectContaining({ year: 2026, status: 500 }));
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("비밀키");
  });

  // 공공데이터포털이 멈춘 동안 화면마다 응답 제한 시간만큼 기다리지 않게 한다
  it("실패한 해는 5분 동안 다시 묻지 않고, 지나면 다시 묻는다", async () => {
    // Arrange
    vi.stubEnv("HOLIDAY_API_KEY", "키");
    let now = 0;
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("{}", { status: 500 }))
      .mockResolvedValueOnce(Response.json(toBody({ item: toItem(20260505, "어린이날") }, 1)));
    const options = { fetcher, now: () => now };

    // Act & Assert
    await expect(getHolidays(2026, options)).resolves.toBeUndefined();
    now = 5 * 60 * 1000 - 1;
    await expect(getHolidays(2026, options)).resolves.toBeUndefined();
    expect(fetcher).toHaveBeenCalledTimes(1);
    now = 5 * 60 * 1000;
    await expect(getHolidays(2026, options)).resolves.toEqual([{ date: "2026-05-05", name: "어린이날" }]);
  });
});

describe("getHolidayNamesInRange", () => {
  beforeEach(() => {
    resetHolidayState();
    vi.stubEnv("HOLIDAY_API_KEY", "키");
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("두 해에 걸친 달력은 두 해를 읽고 범위 안의 공휴일만 남긴다", async () => {
    // Arrange
    const bodyByYear: Record<string, unknown> = {
      "2026": toBody({ item: [toItem(20261009, "한글날"), toItem(20261225, "기독탄신일")] }, 2),
      "2027": toBody({ item: [toItem(20270101, "1월1일"), toItem(20270206, "설날")] }, 2),
    };
    const fetcher = vi.fn(async (url: string | URL | Request) => Response.json(bodyByYear[new URL(String(url)).searchParams.get("solYear") ?? ""]));

    // Act
    const names = await getHolidayNamesInRange({ start: "2026-11-29", end: "2027-01-02" }, { fetcher });

    // Assert
    expect(names).toEqual({ "2026-12-25": "기독탄신일", "2027-01-01": "1월1일" });
  });

  it("한 해를 받지 못해도 받은 해의 공휴일은 남긴다", async () => {
    // Arrange
    const fetcher = vi.fn(async (url: string | URL | Request) =>
      new URL(String(url)).searchParams.get("solYear") === "2026"
        ? Response.json(toBody({ item: toItem(20261225, "기독탄신일") }, 1))
        : new Response("{}", { status: 500 }),
    );

    // Act
    const names = await getHolidayNamesInRange({ start: "2026-11-29", end: "2027-01-02" }, { fetcher });

    // Assert
    expect(names).toEqual({ "2026-12-25": "기독탄신일" });
  });
});

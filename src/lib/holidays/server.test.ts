import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cacheLife } from "next/cache";
import { fetchHolidays, getHolidayNamesInRange, loadHolidays, resetHolidayState, resolveHolidays, toServiceKey } from "./server";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ cacheLife: vi.fn() }));

const toBody = (items: unknown, totalCount: number) => ({
  response: { header: { resultCode: "00", resultMsg: "NORMAL SERVICE." }, body: { items, numOfRows: 100, pageNo: 1, totalCount } },
});
const toItem = (locdate: number, dateName: string) => ({ dateKind: "01", dateName, isHoliday: "Y", locdate, seq: 1 });
/** 하루 호출 한도를 넘었을 때 포털이 상태 코드 200으로 보내는 답 */
const LIMIT_EXCEEDED_BODY = { response: { header: { resultCode: "22", resultMsg: "LIMITED NUMBER OF SERVICE REQUESTS EXCEEDS ERROR." } } };

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
  it("해의 공휴일을 한 번에 받도록 원래 키로 묻고, fetch 저장소에는 맡기지 않는다", async () => {
    // Arrange
    const fetcher = vi.fn(async () => Response.json(toBody({ item: toItem(20260505, "어린이날") }, 1)));

    // Act
    const holidays = await fetchHolidays({ year: 2026, apiKey: "ab%2Bc", fetcher });

    // Assert
    expect(holidays).toEqual([{ date: "2026-05-05", name: "어린이날" }]);
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit & { next?: unknown }];
    const { origin, pathname, searchParams } = new URL(url);
    expect(`${origin}${pathname}`).toBe("https://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getRestDeInfo");
    expect(Object.fromEntries(searchParams)).toEqual({ serviceKey: "ab+c", solYear: "2026", numOfRows: "100", _type: "json" });
    // fetch 저장소는 상태 코드만 보고 저장해 "200인데 내용은 오류"인 답이 하루 남는다(#410). 기억은 getHolidays의 "use cache"가 맡는다
    expect(init.cache).toBeUndefined();
    expect(init.next).toBeUndefined();
    expect(init.signal).toBeInstanceOf(AbortSignal);
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

  // 포털 관문의 오류 답은 _type=json을 줘도 상태 코드 200에 XML로 온다
  it("관문의 XML 오류 답이면 그 결과 코드를 담아 실패로 알린다", async () => {
    // Arrange
    const gateway = vi.fn(
      async () =>
        new Response(
          "<OpenAPI_ServiceResponse><cmmMsgHeader><errMsg>SERVICE ERROR</errMsg><returnAuthMsg>LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR</returnAuthMsg><returnReasonCode>22</returnReasonCode></cmmMsgHeader></OpenAPI_ServiceResponse>",
        ),
    );

    // Act & Assert
    await expect(fetchHolidays({ year: 2026, apiKey: "키", fetcher: gateway })).rejects.toMatchObject({ name: "HolidayLoadError", resultCode: "22" });
  });
});

describe("loadHolidays", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("받지 못하면 undefined를 돌려주고 키 없이 원인을 로그에 남긴다", async () => {
    // Arrange
    const fetcher = vi.fn(async () => new Response("{}", { status: 500 }));

    // Act
    const holidays = await loadHolidays({ year: 2026, apiKey: "비밀키", fetcher });

    // Assert
    expect(holidays).toBeUndefined();
    expect(console.error).toHaveBeenCalledWith("공휴일 조회 실패", expect.objectContaining({ year: 2026, status: 500 }));
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("비밀키");
  });

  // 공공데이터포털은 한도 초과 등을 상태 코드 200에 결과 코드로 알린다. 이 답을 하루 기억하면 공휴일이 하루 사라진다(#410)
  it("상태 코드가 200이어도 결과 코드가 오류면 받지 못한 것으로 보고 결과 코드를 로그에 남긴다", async () => {
    // Arrange
    const fetcher = vi.fn(async () => Response.json(LIMIT_EXCEEDED_BODY));

    // Act
    const holidays = await loadHolidays({ year: 2026, apiKey: "키", fetcher });

    // Assert
    expect(holidays).toBeUndefined();
    expect(console.error).toHaveBeenCalledWith("공휴일 조회 실패", expect.objectContaining({ year: 2026, resultCode: "22" }));
  });
});

describe("resolveHolidays", () => {
  beforeEach(() => {
    resetHolidayState();
    vi.stubEnv("HOLIDAY_API_KEY", "키");
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    vi.mocked(cacheLife).mockReset();
  });

  it("받은 공휴일은 하루 기억한다(임시공휴일은 하루 안에 반영)", async () => {
    // Arrange
    const fetcher = vi.fn(async () => Response.json(toBody({ item: toItem(20260505, "어린이날") }, 1)));

    // Act
    const holidays = await resolveHolidays(2026, fetcher);

    // Assert
    expect(holidays).toEqual([{ date: "2026-05-05", name: "어린이날" }]);
    expect(cacheLife).toHaveBeenCalledWith("days");
  });

  it("받지 못하면 몇 분만 기억해 곧 다시 묻고, 전에 받은 공휴일이 없으면 공휴일 없이 둔다", async () => {
    // Arrange
    const fetcher = vi.fn(async () => Response.json(LIMIT_EXCEEDED_BODY));

    // Act
    const holidays = await resolveHolidays(2026, fetcher);

    // Assert
    expect(holidays).toBeUndefined();
    expect(cacheLife).toHaveBeenCalledWith("minutes");
    expect(cacheLife).not.toHaveBeenCalledWith("days");
  });

  // 하루 뒤 다시 받을 때 포털이 멈춰 있어도 이미 받은 공휴일이 사라지지 않게 한다
  it("다시 받다 실패하면 전에 받은 그해 공휴일을 돌려주고 몇 분만 기억한다", async () => {
    // Arrange
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(toBody({ item: toItem(20260505, "어린이날") }, 1)))
      .mockResolvedValueOnce(new Response("{}", { status: 500 }));
    await resolveHolidays(2026, fetcher);
    vi.mocked(cacheLife).mockClear();

    // Act
    const holidays = await resolveHolidays(2026, fetcher);

    // Assert
    expect(holidays).toEqual([{ date: "2026-05-05", name: "어린이날" }]);
    expect(vi.mocked(cacheLife).mock.calls).toEqual([["minutes"]]);
  });

  it("키가 없으면 외부 API를 부르지 않고 공휴일 없이 두며, 한 번만 알리고 키를 넣으면 곧 반영되게 몇 분만 기억한다", async () => {
    // Arrange
    vi.stubEnv("HOLIDAY_API_KEY", "");
    const fetcher = vi.fn<typeof fetch>();

    // Act
    const holidays = await resolveHolidays(2026, fetcher);
    await resolveHolidays(2027, fetcher);

    // Assert
    expect(holidays).toEqual([]);
    expect(fetcher).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledTimes(1);
    expect(vi.mocked(cacheLife).mock.calls).toEqual([["minutes"], ["minutes"]]);
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
    const names = await getHolidayNamesInRange({ start: "2026-11-29", end: "2027-01-02" }, (year) => resolveHolidays(year, fetcher));

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
    const names = await getHolidayNamesInRange({ start: "2026-11-29", end: "2027-01-02" }, (year) => resolveHolidays(year, fetcher));

    // Assert
    expect(names).toEqual({ "2026-12-25": "기독탄신일" });
  });
});

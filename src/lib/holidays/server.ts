import "server-only";
import { cacheLife } from "next/cache";
import { catchLoadError } from "@/lib/load";
import { HolidayLoadError, parseRestDeInfo, toHolidayNames, type Holiday, type HolidayNames } from "./holidays";

const REST_DE_INFO_URL = "https://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getRestDeInfo";
/** 한 해의 공휴일은 서른 개를 넘지 않는다. 한 번에 다 받는다 */
const ROWS_PER_YEAR = 100;
/** 공휴일은 없어도 되는 정보라 응답이 늦으면 캘린더가 오래 기다리지 않게 짧게 끊는다 */
const HOLIDAY_TIMEOUT_MS = 3000;

/**
 * 공공데이터포털은 인코딩된 키와 원래 키를 함께 보여 준다. 어느 쪽을 넣어도 되게 원래 키로 바꿔 쓴다.
 *
 * @example toServiceKey("abc%2Bdef") // "abc+def"
 */
export const toServiceKey = (key: string): string => {
  if (!key.includes("%")) return key;
  try {
    return decodeURIComponent(key);
  } catch {
    return key;
  }
};

/** 포털 관문의 오류 답(XML `OpenAPI_ServiceResponse`)은 `_type=json`을 줘도 XML로 온다. 그 결과 코드(한도 초과 22 등)를 읽는다 */
const readGatewayReasonCode = (text: string): string | undefined => /<returnReasonCode>\s*(\d+)\s*<\/returnReasonCode>/.exec(text)?.[1];

const parseResponseBody = async (response: Response): Promise<unknown> => {
  const text = await response.text().catch((cause: unknown) => {
    throw new HolidayLoadError({ cause });
  });
  try {
    return JSON.parse(text);
  } catch (cause) {
    throw new HolidayLoadError({ cause, resultCode: readGatewayReasonCode(text) });
  }
};

/**
 * 한 해의 공휴일을 공공데이터포털에서 받는다. 키가 주소에 들어가므로 서버에서만 부르고 주소를 로그에 남기지 않는다.
 * fetch 저장소(`force-cache`)는 상태 코드만 보고 저장해, 포털이 "200인데 내용은 오류"로 답하면 그 답이 하루 남는다(#410).
 * 그래서 fetch 저장 옵션을 주지 않고, 본문 검사를 통과한 결과만 `getHolidays`의 `"use cache"`가 기억한다.
 *
 * @throws {HolidayLoadError} 연결이 끊겼거나, 답이 늦거나, 키가 틀렸거나(403), 응답이 잘못됐을 때
 * @example const holidays = await fetchHolidays({ year: 2026, apiKey })
 */
export const fetchHolidays = async ({
  year,
  apiKey,
  fetcher = fetch,
}: {
  year: number;
  apiKey: string;
  fetcher?: typeof fetch;
}): Promise<Holiday[]> => {
  const params = new URLSearchParams({ serviceKey: toServiceKey(apiKey), solYear: String(year), numOfRows: String(ROWS_PER_YEAR), _type: "json" });
  const response = await fetcher(`${REST_DE_INFO_URL}?${params.toString()}`, { signal: AbortSignal.timeout(HOLIDAY_TIMEOUT_MS) }).catch((cause: unknown) => {
    throw new HolidayLoadError({ cause });
  });
  if (!response.ok) throw new HolidayLoadError({ status: response.status });
  return parseRestDeInfo(await parseResponseBody(response));
};

// 키가 없는 것은 설정 문제라 화면마다 남기지 않고 서버가 뜬 뒤 한 번만 알린다
let hasWarnedMissingKey = false;
// 다시 받다 실패하면 공휴일이 사라지지 않게 이 서버가 해마다 마지막으로 받은 공휴일을 둔다. 해는 1900~2100이라 작다
const lastHolidaysByYear = new Map<number, Holiday[]>();

/** 테스트마다 서버가 막 뜬 상태(키 경고·마지막 공휴일 없음)로 돌린다 */
export const resetHolidayState = (): void => {
  hasWarnedMissingKey = false;
  lastHolidaysByYear.clear();
};

/**
 * 한 해의 공휴일을 받는다. 받지 못하면 undefined를 돌려주고 원인을 서버 로그에 남긴다.
 *
 * @example const holidays = await loadHolidays({ year: 2026, apiKey }) // undefined면 받지 못함
 */
export const loadHolidays = async ({ year, apiKey, fetcher = fetch }: { year: number; apiKey: string; fetcher?: typeof fetch }): Promise<Holiday[] | undefined> => {
  const result = await catchLoadError(() => fetchHolidays({ year, apiKey, fetcher }), HolidayLoadError);
  if (!(result instanceof HolidayLoadError)) return result;
  // catchLoadError가 원인을 남긴다. 어느 해인지와 공공데이터포털의 상태·결과 코드를 덧붙인다
  console.error("공휴일 조회 실패", { year, status: result.status, resultCode: result.resultCode });
  return undefined;
};

/**
 * 한 해의 공휴일을 받고, 기억할 시간을 정한다(`getHolidays`의 `"use cache"` 안에서 부른다).
 * - 받은 공휴일은 하루 기억한다(임시공휴일은 하루 안에 반영).
 * - 받지 못하면 몇 분만 기억한다. 그동안 화면마다 응답 제한 시간만큼 기다리지 않고 곧 다시 묻는다.
 *   이 서버가 전에 받은 그해 공휴일이 있으면 그것을, 없으면 undefined(공휴일 없이 보여 줌)를 돌려준다.
 * - 키가 없으면 공휴일 없이 보여 주고, 키를 넣은 뒤 곧 반영되게 몇 분만 기억한다.
 *
 * @example const holidays = await resolveHolidays(2026) // undefined면 받지 못함
 */
export const resolveHolidays = async (year: number, fetcher: typeof fetch = fetch): Promise<Holiday[] | undefined> => {
  const apiKey = process.env.HOLIDAY_API_KEY;
  if (!apiKey) {
    if (!hasWarnedMissingKey) console.warn("공휴일 키(HOLIDAY_API_KEY)가 없어 공휴일 없이 보여 줍니다");
    hasWarnedMissingKey = true;
    cacheLife("minutes");
    return [];
  }

  const holidays = await loadHolidays({ year, apiKey, fetcher });
  if (!holidays) {
    cacheLife("minutes");
    return lastHolidaysByYear.get(year);
  }
  lastHolidaysByYear.set(year, holidays);
  cacheLife("days");
  return holidays;
};

/**
 * 한 해의 공휴일. 화면을 열 때마다 공공데이터포털을 부르지 않게 기억한다(기억하는 시간은 `resolveHolidays`).
 * 오류를 던지면 화면 오류로 번지므로 값(받지 못하면 undefined)으로 돌려받는다.
 *
 * @example const holidays = await getHolidays(2026) // undefined면 받지 못함
 */
export const getHolidays = async (year: number): Promise<Holiday[] | undefined> => {
  "use cache";
  return resolveHolidays(year);
};

/**
 * 범위(달력의 첫 칸~마지막 칸)의 공휴일 이름. 12월·1월 달력처럼 두 해에 걸치면 두 해를 함께 읽는다.
 * 받지 못한 해는 공휴일 없이 둔다. `getYearHolidays`는 테스트에서 바꿔 끼운다.
 *
 * @example const holidayNames = await getHolidayNamesInRange(getGridRange("2026-12"))
 */
export const getHolidayNamesInRange = async (
  { start, end }: { start: string; end: string },
  getYearHolidays: (year: number) => Promise<Holiday[] | undefined> = getHolidays,
): Promise<HolidayNames> => {
  const years = [...new Set([Number(start.slice(0, 4)), Number(end.slice(0, 4))])];
  const holidays = (await Promise.all(years.map(getYearHolidays))).flatMap((yearHolidays) => yearHolidays ?? []);
  return toHolidayNames(holidays.filter(({ date }) => date >= start && date <= end));
};

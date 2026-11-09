import "server-only";
import { catchLoadError } from "@/lib/load";
import { HolidayLoadError, parseRestDeInfo, toHolidayNames, type Holiday, type HolidayNames } from "./holidays";

const REST_DE_INFO_URL = "https://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getRestDeInfo";
/** 한 해의 공휴일은 서른 개를 넘지 않는다. 한 번에 다 받는다 */
const ROWS_PER_YEAR = 100;
/** 공휴일은 없어도 되는 정보라 응답이 늦으면 캘린더가 오래 기다리지 않게 짧게 끊는다 */
const HOLIDAY_TIMEOUT_MS = 3000;
/** 받은 공휴일을 저장해 두는 시간. 임시공휴일은 하루 안에 반영된다 */
const HOLIDAY_REVALIDATE_SECONDS = 60 * 60 * 24;

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

/**
 * 한 해의 공휴일을 공공데이터포털에서 받는다. 키가 주소에 들어가므로 서버에서만 부르고 주소를 로그에 남기지 않는다.
 * 화면을 열 때마다 외부 API를 부르지 않게 Next의 fetch 저장소에 하루 동안 둔다. 저장소는 200 응답만 저장하므로
 * 거절·서버 오류는 다음 요청에서 다시 묻는다. `"use cache"` 함수 안에서 던진 오류는 화면 오류로 번져 쓰지 않는다.
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
  const response = await fetcher(`${REST_DE_INFO_URL}?${params.toString()}`, {
    cache: "force-cache",
    next: { revalidate: HOLIDAY_REVALIDATE_SECONDS },
    signal: AbortSignal.timeout(HOLIDAY_TIMEOUT_MS),
  }).catch((cause: unknown) => {
    throw new HolidayLoadError({ cause });
  });
  if (!response.ok) throw new HolidayLoadError({ status: response.status });
  return parseRestDeInfo(
    await response.json().catch((cause: unknown) => {
      throw new HolidayLoadError({ cause });
    }),
  );
};

/** 실패한 해는 이만큼 다시 묻지 않는다. 공공데이터포털이 멈춘 동안 화면마다 응답 제한 시간만큼 기다리지 않게 한다 */
const FAILURE_RETRY_MS = 5 * 60 * 1000;
const failedAtByYear = new Map<number, number>();
// 키가 없는 것은 설정 문제라 화면마다 남기지 않고 서버가 뜬 뒤 한 번만 알린다
let hasWarnedMissingKey = false;

/** 테스트마다 서버가 막 뜬 상태(실패 기록·키 경고 없음)로 돌린다 */
export const resetHolidayState = (): void => {
  failedAtByYear.clear();
  hasWarnedMissingKey = false;
};

/** 공휴일을 받을 때 바꿔 끼울 수 있는 것(테스트용) */
export interface HolidayLoadOptions {
  fetcher?: typeof fetch;
  now?: () => number;
}

const fetchConfiguredHolidays = async (year: number, fetcher: typeof fetch): Promise<Holiday[]> => {
  const apiKey = process.env.HOLIDAY_API_KEY;
  if (apiKey) return fetchHolidays({ year, apiKey, fetcher });
  if (!hasWarnedMissingKey) console.warn("공휴일 키(HOLIDAY_API_KEY)가 없어 공휴일 없이 보여 줍니다");
  hasWarnedMissingKey = true;
  return [];
};

/**
 * 한 해의 공휴일. 받지 못하면 화면은 그대로 두고 공휴일만 빼도록 undefined를 돌려주고 원인을 서버 로그에 남긴다.
 * 실패한 해는 5분 동안 다시 묻지 않고 바로 undefined를 돌려준다.
 *
 * @example const holidays = await getHolidays(2026) // undefined면 받지 못함
 */
export const getHolidays = async (year: number, { fetcher = fetch, now = Date.now }: HolidayLoadOptions = {}): Promise<Holiday[] | undefined> => {
  const failedAt = failedAtByYear.get(year);
  if (failedAt !== undefined && now() - failedAt < FAILURE_RETRY_MS) return undefined;

  const result = await catchLoadError(() => fetchConfiguredHolidays(year, fetcher), HolidayLoadError);
  if (!(result instanceof HolidayLoadError)) {
    failedAtByYear.delete(year);
    return result;
  }
  failedAtByYear.set(year, now());
  // catchLoadError가 원인을 남긴다. 어느 해인지와 공공데이터포털의 상태·결과 코드를 덧붙인다
  console.error("공휴일 조회 실패", { year, status: result.status, resultCode: result.resultCode });
  return undefined;
};

/**
 * 범위(달력의 첫 칸~마지막 칸)의 공휴일 이름. 12월·1월 달력처럼 두 해에 걸치면 두 해를 함께 읽는다.
 * 받지 못한 해는 공휴일 없이 둔다.
 *
 * @example const holidayNames = await getHolidayNamesInRange(getGridRange("2026-12"))
 */
export const getHolidayNamesInRange = async (
  { start, end }: { start: string; end: string },
  options: HolidayLoadOptions = {},
): Promise<HolidayNames> => {
  const years = [...new Set([Number(start.slice(0, 4)), Number(end.slice(0, 4))])];
  const holidays = (await Promise.all(years.map((year) => getHolidays(year, options)))).flatMap((yearHolidays) => yearHolidays ?? []);
  return toHolidayNames(holidays.filter(({ date }) => date >= start && date <= end));
};

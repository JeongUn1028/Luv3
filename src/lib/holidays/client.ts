import { HOLIDAYS_PATH, HolidayLoadError, parseHolidayResults, toHolidayNames, type HolidayNames } from "./holidays";

/** 홈 화면 앱은 며칠씩 켜 두므로 임시공휴일이 반영되게 이만큼 지나면 다시 묻는다 */
const NAMES_MAX_AGE_MS = 60 * 60 * 1000;

// 창을 다시 열거나 해를 오가도 같은 해를 곧바로 다시 묻지 않는다. 실패한 해는 지워 다음에 다시 묻는다
const namesByYear = new Map<number, { pending: Promise<HolidayNames>; requestedAt: number }>();

/**
 * 날짜 창이 쓸 한 해의 공휴일 이름을 우리 API에서 받는다. 같은 해는 한 시간에 한 번만 묻는다.
 *
 * @throws {HolidayLoadError} 받지 못했을 때(창은 공휴일 없이 그린다)
 * @example const names = await loadHolidayNames(2026)
 */
export const loadHolidayNames = (year: number, fetcher: typeof fetch = fetch, now: () => number = Date.now): Promise<HolidayNames> => {
  const cached = namesByYear.get(year);
  if (cached && now() - cached.requestedAt < NAMES_MAX_AGE_MS) return cached.pending;

  const pending = (async () => {
    const response = await fetcher(`${HOLIDAYS_PATH}?year=${year}`).catch((cause: unknown) => {
      throw new HolidayLoadError({ cause });
    });
    if (!response.ok) throw new HolidayLoadError({ status: response.status });
    return toHolidayNames(parseHolidayResults(await response.json().catch((cause: unknown) => {
      throw new HolidayLoadError({ cause });
    })));
  })();
  const entry = { pending, requestedAt: now() };
  namesByYear.set(year, entry);
  pending.catch(() => {
    if (namesByYear.get(year) === entry) namesByYear.delete(year);
  });
  return pending;
};

/** 테스트마다 기억한 해를 비운다 */
export const clearHolidayNamesCache = (): void => namesByYear.clear();

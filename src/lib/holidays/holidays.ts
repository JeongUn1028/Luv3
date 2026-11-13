import { isIsoDate } from "@/lib/form";
import { isObject } from "@/lib/guards";

/** 공휴일 하루 */
export interface Holiday {
  /** YYYY-MM-DD */
  date: string;
  name: string;
}

/** 날짜(YYYY-MM-DD)마다 공휴일 이름. 하루에 공휴일이 둘이면 이름을 이어 붙인다 */
export type HolidayNames = Readonly<Record<string, string>>;

/** 날짜 창이 공휴일을 받는 주소. 화면과 API 경로가 함께 쓴다 */
export const HOLIDAYS_PATH = "/api/holidays";

/** 공휴일을 물을 수 있는 해. 주소는 손으로 바꿀 수 있어 이 밖의 해는 거절한다 */
const YEAR_RANGE = { min: 1900, max: 2100 } as const;

/** 공휴일을 받지 못했을 때. 공공데이터포털의 상태 코드나 결과 코드가 있으면 담는다 */
export class HolidayLoadError extends Error {
  readonly status: number | undefined;
  readonly resultCode: string | undefined;

  constructor(options?: ErrorOptions & { status?: number; resultCode?: string }) {
    super("공휴일을 불러오지 못했어요.", options);
    this.name = "HolidayLoadError";
    this.status = options?.status;
    this.resultCode = options?.resultCode;
  }
}

/**
 * 주소의 `year` 값을 읽는다. 네 자리 숫자이고 물을 수 있는 해일 때만 받는다.
 *
 * @example parseHolidayYear("2026") // 2026
 */
export const parseHolidayYear = (value: string | null): number | undefined => {
  if (!value || !/^\d{4}$/.test(value)) return undefined;
  const year = Number(value);
  return year >= YEAR_RANGE.min && year <= YEAR_RANGE.max ? year : undefined;
};

// 응답의 날짜는 20260505 같은 숫자다
const toIsoDate = (locdate: unknown): string | undefined => {
  const text = typeof locdate === "number" || typeof locdate === "string" ? String(locdate) : "";
  const match = /^(\d{4})(\d{2})(\d{2})$/.exec(text);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : undefined;
};

const toHoliday = (item: unknown): Holiday => {
  if (!isObject(item)) throw new HolidayLoadError();
  const date = toIsoDate(item.locdate);
  if (!date || typeof item.dateName !== "string" || item.dateName.trim() === "" || typeof item.isHoliday !== "string") throw new HolidayLoadError();
  return { date, name: item.dateName.trim() };
};

/**
 * 한국천문연구원 특일 정보의 공휴일 조회(`getRestDeInfo`) JSON 응답을 읽는다.
 * 결과가 없으면 `items`가 빈 글자, 1건이면 `item`이 배열이 아닌 객체로 온다(2026-11 실제 응답으로 확인).
 * 쉬는 날(`isHoliday` "Y")만 남긴다. 받은 수가 전체 수보다 적으면 빠진 공휴일이 있으므로 실패로 본다.
 *
 * @throws {HolidayLoadError} 결과 코드가 정상이 아니거나 모양이 다를 때
 * @example parseRestDeInfo(await response.json()) // [{ date: "2026-05-05", name: "어린이날" }]
 */
export const parseRestDeInfo = (body: unknown): Holiday[] => {
  const response = isObject(body) ? body.response : undefined;
  if (!isObject(response) || !isObject(response.header) || !isObject(response.body)) throw new HolidayLoadError();
  const resultCode = response.header.resultCode;
  if (resultCode !== "00") throw new HolidayLoadError({ resultCode: typeof resultCode === "string" ? resultCode : undefined });

  const { items, totalCount } = response.body;
  if (items !== "" && !isObject(items)) throw new HolidayLoadError();
  const item = isObject(items) ? items.item : undefined;
  const rawItems: unknown[] = Array.isArray(item) ? item : item === undefined ? [] : [item];
  if (typeof totalCount !== "number" || rawItems.length < totalCount) throw new HolidayLoadError();

  return rawItems
    .filter((raw) => !isObject(raw) || raw.isHoliday !== "N")
    .map(toHoliday);
};

/**
 * 우리 API(`HOLIDAYS_PATH`)의 응답을 읽는다.
 *
 * @throws {HolidayLoadError} 모양이 다를 때
 * @example parseHolidayResults(await response.json())
 */
export const parseHolidayResults = (body: unknown): Holiday[] => {
  if (!isObject(body) || !Array.isArray(body.holidays)) throw new HolidayLoadError();
  return body.holidays.map((holiday: unknown) => {
    if (!isObject(holiday) || typeof holiday.date !== "string" || !isIsoDate(holiday.date) || typeof holiday.name !== "string") throw new HolidayLoadError();
    return { date: holiday.date, name: holiday.name };
  });
};

/**
 * 날짜마다 공휴일 이름을 모은다. 어린이날과 부처님오신날이 겹친 해처럼 하루에 둘이면 " · "로 잇는다.
 *
 * @example toHolidayNames([{ date: "2025-05-05", name: "어린이날" }, { date: "2025-05-05", name: "부처님오신날" }]) // { "2025-05-05": "어린이날 · 부처님오신날" }
 */
export const toHolidayNames = (holidays: Holiday[]): HolidayNames => {
  const names: Record<string, string> = {};
  for (const { date, name } of holidays) {
    const existing = names[date];
    if (existing?.split(" · ").includes(name)) continue;
    names[date] = existing ? `${existing} · ${name}` : name;
  }
  return names;
};

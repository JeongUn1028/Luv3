import { describe, expect, it } from "vitest";
import { HolidayLoadError, parseHolidayResults, parseHolidayYear, parseRestDeInfo, toHolidayNames } from "./holidays";

// 2026-11 실제 응답의 모양을 그대로 옮겼다
const toResponse = (items: unknown, totalCount: number, resultCode = "00") => ({
  response: { header: { resultCode, resultMsg: "NORMAL SERVICE." }, body: { items, numOfRows: 100, pageNo: 1, totalCount } },
});
const CHILDREN_DAY = { dateKind: "01", dateName: "어린이날", isHoliday: "Y", locdate: 20260505, seq: 2 };
const BUDDHA_DAY = { dateKind: "01", dateName: "부처님오신날", isHoliday: "Y", locdate: 20260524, seq: 1 };

describe("parseHolidayYear", () => {
  it("네 자리 해만 받는다", () => {
    expect(parseHolidayYear("2026")).toBe(2026);
    expect(parseHolidayYear("26")).toBeUndefined();
    expect(parseHolidayYear("2026.5")).toBeUndefined();
    expect(parseHolidayYear(null)).toBeUndefined();
  });

  it("물을 수 있는 해(1900~2100) 밖은 거절한다", () => {
    expect(parseHolidayYear("1899")).toBeUndefined();
    expect(parseHolidayYear("2101")).toBeUndefined();
    expect(parseHolidayYear("2100")).toBe(2100);
  });
});

describe("parseRestDeInfo", () => {
  it("여러 건이면 날짜를 YYYY-MM-DD로 바꿔 읽는다", () => {
    expect(parseRestDeInfo(toResponse({ item: [CHILDREN_DAY, BUDDHA_DAY] }, 2))).toEqual([
      { date: "2026-05-05", name: "어린이날" },
      { date: "2026-05-24", name: "부처님오신날" },
    ]);
  });

  it("1건이면 배열이 아닌 객체로 와도 읽는다", () => {
    expect(parseRestDeInfo(toResponse({ item: CHILDREN_DAY }, 1))).toEqual([{ date: "2026-05-05", name: "어린이날" }]);
  });

  it("결과가 없으면 items가 빈 글자로 와도 빈 목록이다", () => {
    expect(parseRestDeInfo(toResponse("", 0))).toEqual([]);
  });

  it("쉬는 날이 아닌 항목은 뺀다", () => {
    expect(parseRestDeInfo(toResponse({ item: [CHILDREN_DAY, { ...BUDDHA_DAY, isHoliday: "N" }] }, 2))).toEqual([
      { date: "2026-05-05", name: "어린이날" },
    ]);
  });

  it("결과 코드가 정상이 아니면 코드를 담아 실패로 본다", () => {
    expect(() => parseRestDeInfo(toResponse("", 0, "22"))).toThrow(expect.objectContaining({ name: "HolidayLoadError", resultCode: "22" }));
  });

  // 일부만 받은 채 공휴일이 빠져 보이면 안 된다
  it("받은 수가 전체 수보다 적으면 실패로 본다", () => {
    expect(() => parseRestDeInfo(toResponse({ item: CHILDREN_DAY }, 2))).toThrow(HolidayLoadError);
  });

  it("모양이 다르면 실패로 본다", () => {
    expect(() => parseRestDeInfo(undefined)).toThrow(HolidayLoadError);
    expect(() => parseRestDeInfo({ OpenAPI_ServiceResponse: {} })).toThrow(HolidayLoadError);
    expect(() => parseRestDeInfo(toResponse({ item: [{ ...CHILDREN_DAY, locdate: "2026-05-05" }] }, 1))).toThrow(HolidayLoadError);
    expect(() => parseRestDeInfo(toResponse({ item: [{ ...CHILDREN_DAY, dateName: " " }] }, 1))).toThrow(HolidayLoadError);
    expect(() => parseRestDeInfo(toResponse([], 0))).toThrow(HolidayLoadError);
  });
});

describe("parseHolidayResults", () => {
  it("우리 API의 공휴일 목록을 읽는다", () => {
    expect(parseHolidayResults({ holidays: [{ date: "2026-05-05", name: "어린이날" }] })).toEqual([{ date: "2026-05-05", name: "어린이날" }]);
  });

  it("모양이 다르면 실패로 본다", () => {
    expect(() => parseHolidayResults({ items: [] })).toThrow(HolidayLoadError);
    expect(() => parseHolidayResults({ holidays: [{ date: "2026-05-05" }] })).toThrow(HolidayLoadError);
    // 날짜 형식이 다르면 어느 칸에도 맞지 않아 공휴일이 조용히 사라진다
    expect(() => parseHolidayResults({ holidays: [{ date: "20260505", name: "어린이날" }] })).toThrow(HolidayLoadError);
  });
});

describe("toHolidayNames", () => {
  it("날짜마다 이름을 모으고 하루에 둘이면 이어 붙인다", () => {
    expect(
      toHolidayNames([
        { date: "2025-05-05", name: "어린이날" },
        { date: "2025-05-05", name: "부처님오신날" },
        { date: "2025-05-06", name: "대체공휴일" },
      ]),
    ).toEqual({ "2025-05-05": "어린이날 · 부처님오신날", "2025-05-06": "대체공휴일" });
  });

  it("같은 날 같은 이름은 한 번만 쓴다", () => {
    expect(
      toHolidayNames([
        { date: "2026-02-17", name: "설날" },
        { date: "2026-02-17", name: "설날" },
      ]),
    ).toEqual({ "2026-02-17": "설날" });
  });
});

import { describe, expect, it } from "vitest";
import { formatRecordDate, formatRecordMonthDay, formatRecordPeriod, formatRecordShortDate } from "./record-date-format";

describe("formatRecordDate", () => {
  it("YYYY.MM.DD와 요일로 쓴다", () => {
    expect(formatRecordDate("2026-11-02")).toBe("2026.11.02 월요일");
    expect(formatRecordDate("2025-12-24")).toBe("2025.12.24 수요일");
  });
});

describe("formatRecordPeriod", () => {
  it("하루짜리는 날짜 표기 그대로다", () => {
    expect(formatRecordPeriod({ date: "2026-11-02", endDate: undefined })).toBe("2026.11.02 월요일");
  });

  it("같은 달 기간은 끝 날짜에서 연도를 뺀다", () => {
    expect(formatRecordPeriod({ date: "2026-11-01", endDate: "2026-11-03" })).toBe("2026.11.01 일요일 – 11.03 화요일");
  });

  it("달이 바뀌는 기간도 끝 날짜에서 연도를 뺀다", () => {
    expect(formatRecordPeriod({ date: "2026-10-31", endDate: "2026-11-02" })).toBe("2026.10.31 토요일 – 11.02 월요일");
  });

  it("해가 바뀌는 기간은 끝 날짜에도 연도를 쓴다", () => {
    expect(formatRecordPeriod({ date: "2026-12-31", endDate: "2027-01-02" })).toBe("2026.12.31 목요일 – 2027.01.02 토요일");
  });
});

describe("formatRecordShortDate", () => {
  it("하루짜리는 월.일과 요일을 쓴다", () => {
    expect(formatRecordShortDate({ date: "2026-11-02", endDate: undefined })).toBe("11.02 월요일");
  });

  it("기간은 그리드와 같은 표기로 요일 없이 쓴다", () => {
    expect(formatRecordShortDate({ date: "2026-11-01", endDate: "2026-11-03" })).toBe("11.01–11.03");
  });

  it("달이나 해가 바뀌어도 그리드와 같은 표기다", () => {
    expect(formatRecordShortDate({ date: "2026-10-31", endDate: "2026-11-02" })).toBe("10.31–11.02");
    expect(formatRecordShortDate({ date: "2026-12-31", endDate: "2027-01-02" })).toBe("12.31–01.02");
  });
});

describe("formatRecordMonthDay", () => {
  it("연도 없이 MM.DD와 요일로 쓴다", () => {
    expect(formatRecordMonthDay("2026-11-02")).toBe("11.02 월요일");
    expect(formatRecordMonthDay("2025-12-24")).toBe("12.24 수요일");
  });
});

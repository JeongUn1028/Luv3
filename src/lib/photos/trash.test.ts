import { describe, expect, it } from "vitest";
import { countTrashDaysLeft, isTrashExpired } from "./trash";

// 한국 시간 2026-11-12 오후 3시
const NOW = new Date("2026-11-12T06:00:00Z");

describe("countTrashDaysLeft", () => {
  it("방금 지웠으면 보관 기간 30일이 모두 남는다", () => {
    expect(countTrashDaysLeft({ deletedAt: NOW.toISOString(), now: NOW })).toBe(30);
  });

  it("하루하고 조금 지났으면 남은 날을 올려 세어 29일이다", () => {
    expect(countTrashDaysLeft({ deletedAt: "2026-11-11T05:00:00Z", now: NOW })).toBe(29);
  });

  it("30일이 지나 정리를 기다리는 사진은 0일이다", () => {
    expect(countTrashDaysLeft({ deletedAt: "2026-10-01T00:00:00Z", now: NOW })).toBe(0);
  });

  it("지운 시각을 읽을 수 없으면 정리 작업처럼 지우지 않는 쪽으로 30일로 본다", () => {
    expect(countTrashDaysLeft({ deletedAt: "알 수 없음", now: NOW })).toBe(30);
  });

  it.each([
    ["2026-10-13T06:00:01Z", 1, false],
    ["2026-10-13T06:00:00Z", 0, true],
  ])("정리 작업이 지우지 않는 사진만 1일 이상 남는다(%s)", (deletedAt, daysLeft, isExpired) => {
    expect(countTrashDaysLeft({ deletedAt, now: NOW })).toBe(daysLeft);
    expect(isTrashExpired({ deletedAt, now: NOW })).toBe(isExpired);
  });
});

import { describe, expect, it } from "vitest";
import { clampMonth, getFocusDate, getInitialMonth, getKeyboardDayOffset, isSelectableDate } from "./date-picker";

describe("isSelectableDate", () => {
  it("범위가 없으면 어느 날이든 고를 수 있다", () => {
    expect(isSelectableDate("2036-03-05", {})).toBe(true);
  });

  it("범위의 첫날과 마지막 날은 고를 수 있고 그 밖은 고를 수 없다", () => {
    const bounds = { min: "2026-11-02", max: "2026-11-06" };

    expect(isSelectableDate("2026-11-01", bounds)).toBe(false);
    expect(isSelectableDate("2026-11-02", bounds)).toBe(true);
    expect(isSelectableDate("2026-11-06", bounds)).toBe(true);
    expect(isSelectableDate("2026-11-07", bounds)).toBe(false);
  });
});

describe("clampMonth", () => {
  it("범위 밖의 달은 범위 안의 가장 가까운 달로 당기고 범위 안의 달은 그대로 둔다", () => {
    const bounds = { min: "2026-10-31", max: "2026-11-06" };

    expect(clampMonth("2026-09", bounds)).toBe("2026-10");
    expect(clampMonth("2026-10", bounds)).toBe("2026-10");
    expect(clampMonth("2026-11", bounds)).toBe("2026-11");
    expect(clampMonth("2026-12", bounds)).toBe("2026-11");
  });

  it("범위가 없으면 그대로 둔다", () => {
    expect(clampMonth("2036-03", {})).toBe("2036-03");
  });
});

describe("getInitialMonth", () => {
  it("값이 있으면 그 값의 달을 연다", () => {
    expect(getInitialMonth("2036-03-05", "2026-11-06", {})).toBe("2036-03");
  });

  it("값이 비었거나 틀리면 오늘이 속한 달을 연다", () => {
    expect(getInitialMonth("", "2026-11-06", {})).toBe("2026-11");
    expect(getInitialMonth("2026-02-31", "2026-11-06", {})).toBe("2026-11");
  });

  it("여는 달이 범위 밖이면 범위 안의 가장 가까운 달을 연다", () => {
    // 시작 날짜를 끝 날짜보다 뒤로 옮기면 끝 날짜가 범위 밖에 남는다. 그대로 열면 이전·다음 달 버튼이 모두 막힌다
    expect(getInitialMonth("2026-09-01", "2026-11-06", { min: "2026-10-31" })).toBe("2026-10");
    expect(getInitialMonth("2027-01-01", "2026-11-06", { max: "2026-11-06" })).toBe("2026-11");
    expect(getInitialMonth("", "2026-11-06", { min: "2027-02-01" })).toBe("2027-02");
  });
});

describe("getFocusDate", () => {
  it("보는 달에 값이 있으면 값을 고른다", () => {
    expect(getFocusDate({ month: "2026-11", value: "2026-11-03", today: "2026-11-06", bounds: {} })).toBe("2026-11-03");
  });

  it("값이 보는 달에 없으면 오늘을 고른다", () => {
    expect(getFocusDate({ month: "2026-11", value: "2026-10-03", today: "2026-11-06", bounds: {} })).toBe("2026-11-06");
  });

  it("값과 오늘이 모두 보는 달에 없으면 달의 첫날을 고른다", () => {
    expect(getFocusDate({ month: "2026-12", value: "", today: "2026-11-06", bounds: {} })).toBe("2026-12-01");
  });

  it("값이 달력에 없는 날이면 값을 쓰지 않는다", () => {
    expect(getFocusDate({ month: "2026-02", value: "2026-02-31", today: "2026-11-06", bounds: {} })).toBe("2026-02-01");
  });

  it("고를 수 없는 날은 건너뛰고 고를 수 있는 첫날을 고른다", () => {
    const bounds = { min: "2026-11-10" };

    expect(getFocusDate({ month: "2026-11", value: "2026-11-03", today: "2026-11-06", bounds })).toBe("2026-11-10");
  });
});

describe("getKeyboardDayOffset", () => {
  it("화살표는 하루나 한 주만큼 옮긴다", () => {
    expect(getKeyboardDayOffset("ArrowLeft")).toBe(-1);
    expect(getKeyboardDayOffset("ArrowRight")).toBe(1);
    expect(getKeyboardDayOffset("ArrowUp")).toBe(-7);
    expect(getKeyboardDayOffset("ArrowDown")).toBe(7);
  });

  it("다른 키는 옮기지 않는다", () => {
    expect(getKeyboardDayOffset("Enter")).toBeUndefined();
  });
});

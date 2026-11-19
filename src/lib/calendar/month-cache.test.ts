import { describe, expect, it, vi } from "vitest";
import type { CalendarMonth } from "@/lib/events/calendar-month";
import { createMonthCache, getAdjacentMonths } from "./month-cache";

const EMPTY_MONTH: CalendarMonth = { events: [], records: [] };

const createDeferred = <Value>() => {
  let resolve: (value: Value) => void = () => undefined;
  let reject: (reason: unknown) => void = () => undefined;
  const promise = new Promise<Value>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
};

describe("createMonthCache", () => {
  it("처음 받은 달은 받은 것으로 두고 다시 받지 않는다", () => {
    // Arrange
    const load = vi.fn<(month: string) => Promise<CalendarMonth>>();
    const cache = createMonthCache({ load, initial: { month: "2026-11", data: EMPTY_MONTH } });

    // Act
    cache.load("2026-11");

    // Assert
    expect(cache.get("2026-11")).toEqual({ status: "loaded", data: EMPTY_MONTH });
    expect(load).not.toHaveBeenCalled();
  });

  it("모르는 달을 받으면 받는 중으로 알리고, 다 받으면 받은 것으로 알린다", async () => {
    // Arrange
    const deferred = createDeferred<CalendarMonth>();
    const cache = createMonthCache({ load: () => deferred.promise, initial: { month: "2026-11", data: EMPTY_MONTH } });
    const listener = vi.fn();
    cache.subscribe(listener);

    // Act
    cache.load("2026-12");
    const whileLoading = cache.get("2026-12");
    deferred.resolve(EMPTY_MONTH);
    await deferred.promise;

    // Assert
    expect(whileLoading).toEqual({ status: "loading" });
    expect(cache.get("2026-12")).toEqual({ status: "loaded", data: EMPTY_MONTH });
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("받는 중인 달을 또 받으면 한 번만 묻는다", () => {
    // Arrange
    const load = vi.fn(() => new Promise<CalendarMonth>(() => undefined));
    const cache = createMonthCache({ load, initial: { month: "2026-11", data: EMPTY_MONTH } });

    // Act
    cache.load("2026-12");
    cache.load("2026-12");

    // Assert
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("받지 못한 달은 실패로 알리고, 다시 받으면 또 묻는다", async () => {
    // Arrange
    const load = vi.fn<(month: string) => Promise<CalendarMonth>>().mockRejectedValueOnce(new Error("끊김")).mockResolvedValueOnce(EMPTY_MONTH);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const cache = createMonthCache({ load, initial: { month: "2026-11", data: EMPTY_MONTH } });

    // Act
    cache.load("2026-12");
    await vi.waitFor(() => expect(cache.get("2026-12")).toEqual({ status: "failed" }));
    cache.load("2026-12");
    await vi.waitFor(() => expect(cache.get("2026-12")?.status).toBe("loaded"));

    // Assert
    expect(load).toHaveBeenCalledTimes(2);
    consoleError.mockRestore();
  });

  // 라이브러리 파일을 받지 못한 실패는 조회 오류에 담기지 않아, 여기서 남기지 않으면 원인을 알 수 없다(#486)
  it("받지 못하면 원인을 개발자 도구에 남긴다", async () => {
    // Arrange
    const cause = new Error("파일을 받지 못함");
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const cache = createMonthCache({ load: () => Promise.reject(cause), initial: { month: "2026-11", data: EMPTY_MONTH } });

    // Act
    cache.load("2026-12");

    // Assert
    await vi.waitFor(() => expect(consoleError).toHaveBeenCalledWith(cause));
    consoleError.mockRestore();
  });

  it("구독을 풀면 더는 알리지 않는다", async () => {
    // Arrange
    const cache = createMonthCache({ load: () => Promise.resolve(EMPTY_MONTH), initial: { month: "2026-11", data: EMPTY_MONTH } });
    const listener = vi.fn();
    const unsubscribe = cache.subscribe(listener);

    // Act
    unsubscribe();
    cache.load("2026-12");
    await Promise.resolve();

    // Assert
    expect(listener).not.toHaveBeenCalled();
  });
});

describe("getAdjacentMonths", () => {
  it("해가 바뀌는 달이면 앞뒤 해의 달을 준다", () => {
    // Act & Assert
    expect(getAdjacentMonths("2026-01")).toEqual(["2025-12", "2026-02"]);
    expect(getAdjacentMonths("2026-12")).toEqual(["2026-11", "2027-01"]);
  });
});

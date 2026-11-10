import { describe, expect, it, vi } from "vitest";
import { callWithRetry, isDuplicateKey, isOutcomeUnknown } from "./save-outcome";

describe("isOutcomeUnknown", () => {
  it.each(["22023", "23505", "42501", "P0002", "P0409", "PGRST116", "PGRST301"])("서버가 분명히 거절한 코드 %s면 거짓이다", (code) => {
    expect(isOutcomeUnknown({ code })).toBe(false);
  });

  it.each(["", "08006", "57P01", "PGRST000"])("저장됐는지 알 수 없는 코드 %s면 참이다", (code) => {
    expect(isOutcomeUnknown({ code })).toBe(true);
  });

  it("코드가 없으면(네트워크 오류) 참이다", () => {
    expect(isOutcomeUnknown({})).toBe(true);
  });
});

describe("isDuplicateKey", () => {
  it("같은 키가 이미 있다는 코드면 참이다", () => {
    expect(isDuplicateKey({ code: "23505" })).toBe(true);
  });

  it("다른 코드면 거짓이다", () => {
    expect(isDuplicateKey({ code: "23514" })).toBe(false);
  });
});

describe("callWithRetry", () => {
  it("성공하면 한 번만 보낸다", async () => {
    // Arrange
    const call = vi.fn(async () => ({ error: null }));

    // Act
    const result = await callWithRetry(call);

    // Assert
    expect(call).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ error: null, mayHaveApplied: false });
  });

  it("서버가 분명히 거절하면 다시 보내지 않는다", async () => {
    // Arrange
    const error = { message: "거절", code: "22023" };
    const call = vi.fn(async () => ({ error }));

    // Act
    const result = await callWithRetry(call);

    // Assert
    expect(call).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ error, mayHaveApplied: false });
  });

  it("응답이 끊기면 한 번 더 보내고, 첫 요청이 저장됐을 수 있다고 알린다", async () => {
    // Arrange
    const call = vi
      .fn<() => Promise<{ error: { message: string; code?: string } | null }>>()
      .mockResolvedValueOnce({ error: { message: "TypeError: Failed to fetch", code: "" } })
      .mockResolvedValueOnce({ error: null });

    // Act
    const result = await callWithRetry(call);

    // Assert
    expect(call).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ error: null, mayHaveApplied: true });
  });
});

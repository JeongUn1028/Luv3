import { describe, expect, it } from "vitest";
import { createPhotoRefreshGate, PHOTO_REFRESH_INTERVAL_MS } from "./photo-retry";

describe("createPhotoRefreshGate", () => {
  it("여러 사진이 한꺼번에 실패해도 화면은 한 번만 새로 받는다", () => {
    // Arrange
    const now = 1_000_000;
    const gate = createPhotoRefreshGate(() => now);

    // Act
    const claims = [gate.tryClaim(), gate.tryClaim(), gate.tryClaim()];

    // Assert
    expect(claims).toEqual([true, false, false]);
  });

  it("정한 시간이 지나면 다시 새로 받을 수 있다", () => {
    // Arrange
    let now = 1_000_000;
    const gate = createPhotoRefreshGate(() => now);
    gate.tryClaim();

    // Act
    now += PHOTO_REFRESH_INTERVAL_MS - 1;
    const beforeInterval = gate.tryClaim();
    now += 1;
    const afterInterval = gate.tryClaim();

    // Assert
    expect(PHOTO_REFRESH_INTERVAL_MS).toBe(60_000);
    expect([beforeInterval, afterInterval]).toEqual([false, true]);
  });
});

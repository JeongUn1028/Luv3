import { describe, expect, it } from "vitest";
import { canRetryPhoto, createBrokenPhotoList, createPhotoRefreshGate, MAX_PHOTO_RETRIES, PHOTO_REFRESH_INTERVAL_MS } from "./photo-retry";

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

describe("createBrokenPhotoList", () => {
  it("꺼내면 적힌 일을 모두 돌려주고 목록을 비운다", () => {
    // Arrange
    const list = createBrokenPhotoList();
    const first = (): void => undefined;
    const second = (): void => undefined;
    list.add(first);
    list.add(second);

    // Act
    const taken = list.takeAll();

    // Assert
    expect(taken).toEqual([first, second]);
    expect(list.takeAll()).toEqual([]);
  });

  it("다 받아 지우면 꺼낼 때 빠진다", () => {
    // Arrange
    const list = createBrokenPhotoList();
    const loaded = (): void => undefined;
    const broken = (): void => undefined;
    const removeLoaded = list.add(loaded);
    list.add(broken);

    // Act
    removeLoaded();

    // Assert
    expect(list.takeAll()).toEqual([broken]);
  });

  it("다시 연결되면 한 알림에 한 번만 새로 받을 차례를 준다", () => {
    // Arrange
    const list = createBrokenPhotoList();
    list.add(() => undefined);
    const event = new Event("online");

    // Act
    const claims = [list.tryClaimReconnect(event), list.tryClaimReconnect(event), list.tryClaimReconnect(new Event("online"))];

    // Assert
    expect(claims).toEqual([true, false, true]);
  });

  it("깨진 사진이 없으면 다시 연결돼도 새로 받지 않는다", () => {
    // Arrange
    const list = createBrokenPhotoList();

    // Act
    const isClaimed = list.tryClaimReconnect(new Event("online"));

    // Assert
    expect(isClaimed).toBe(false);
  });
});

describe("canRetryPhoto", () => {
  it("정한 횟수만큼 다시 받았으면 더 받지 않는다", () => {
    // Arrange
    const counts = [0, MAX_PHOTO_RETRIES - 1, MAX_PHOTO_RETRIES];

    // Act
    const results = counts.map(canRetryPhoto);

    // Assert
    expect(MAX_PHOTO_RETRIES).toBe(2);
    expect(results).toEqual([true, true, false]);
  });
});

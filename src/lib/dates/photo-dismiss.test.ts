import { describe, expect, it } from "vitest";
import { DISMISS_DISTANCE_PX, isDismissDrag, shouldDismissPhoto, toDismissZoom, toReleaseVelocity } from "./photo-dismiss";

describe("isDismissDrag", () => {
  it("아래로 더 많이 움직이면 밀어 닫기다", () => {
    expect(isDismissDrag({ x: 4, y: 12 })).toBe(true);
  });

  it("옆으로 더 많이 움직이면 사진 넘기기라 밀어 닫기가 아니다", () => {
    expect(isDismissDrag({ x: 14, y: 12 })).toBe(false);
  });

  it("위로 움직이면 밀어 닫기가 아니다", () => {
    expect(isDismissDrag({ x: 0, y: -20 })).toBe(false);
  });
});

describe("toDismissZoom", () => {
  it("아래로 민 만큼 사진을 내리고 조금 줄인다", () => {
    const zoom = toDismissZoom({ x: 10, y: 200 });

    expect(zoom.x).toBe(10);
    expect(zoom.y).toBe(200);
    expect(zoom.scale).toBeLessThan(1);
  });

  it("많이 밀어도 너무 작아지지 않는다", () => {
    expect(toDismissZoom({ x: 0, y: 5000 }).scale).toBeGreaterThanOrEqual(0.7);
  });

  it("처음 자리보다 위로 올리면 처음 자리에 둔다", () => {
    expect(toDismissZoom({ x: 0, y: -40 })).toEqual({ scale: 1, x: 0, y: 0 });
  });
});

describe("shouldDismissPhoto", () => {
  it("정한 거리보다 많이 내리면 닫는다", () => {
    expect(shouldDismissPhoto({ distance: DISMISS_DISTANCE_PX + 1, velocity: 0 })).toBe(true);
  });

  it("조금만 내렸어도 빠르게 튕기면 닫는다", () => {
    expect(shouldDismissPhoto({ distance: 40, velocity: 0.8 })).toBe(true);
  });

  it("조금 천천히 내렸다 놓으면 닫지 않는다", () => {
    expect(shouldDismissPhoto({ distance: 40, velocity: 0.1 })).toBe(false);
  });

  it("빠르게 튕겨도 거의 움직이지 않았으면 닫지 않는다", () => {
    expect(shouldDismissPhoto({ distance: 5, velocity: 2 })).toBe(false);
  });
});

describe("toReleaseVelocity", () => {
  it("놓기 직전 잠깐 동안 아래로 움직인 빠르기를 잰다", () => {
    const samples = [
      { y: 0, time: 0 },
      { y: 20, time: 960 },
      { y: 40, time: 980 },
      { y: 60, time: 1000 },
    ];

    expect(toReleaseVelocity({ samples, time: 1000 })).toBeCloseTo(1);
  });

  it("마지막 두 기록이 거의 같은 시각이어도 한 기록에 휘둘리지 않는다", () => {
    const samples = [
      { y: 0, time: 900 },
      { y: 10, time: 990 },
      { y: 13, time: 991 },
    ];

    expect(toReleaseVelocity({ samples, time: 991 })).toBeLessThan(0.5);
  });

  it("마지막에 같은 자리 기록이 와도 앞서 빠르게 내렸으면 빠르기를 남긴다", () => {
    const samples = [
      { y: 0, time: 950 },
      { y: 50, time: 990 },
      { y: 50, time: 1000 },
    ];

    expect(toReleaseVelocity({ samples, time: 1000 })).toBeGreaterThan(0.5);
  });

  it("놓기 전에 멈춰 있었으면 빠르기는 0이다", () => {
    const samples = [
      { y: 0, time: 0 },
      { y: 40, time: 100 },
    ];

    expect(toReleaseVelocity({ samples, time: 400 })).toBe(0);
  });

  it("기록이 하나뿐이면 빠르기는 0이다", () => {
    expect(toReleaseVelocity({ samples: [{ y: 10, time: 0 }], time: 0 })).toBe(0);
  });
});

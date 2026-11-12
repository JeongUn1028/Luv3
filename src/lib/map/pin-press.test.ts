import { describe, expect, it } from "vitest";
import { isMapClickFromPinPress, PIN_PRESS_MAP_CLICK_WINDOW_MS } from "./pin-press";

describe("isMapClickFromPinPress", () => {
  it("핀을 누른 직후에 온 지도 누름은 그 핀 누름이 지도로 이어진 것으로 본다", () => {
    expect(isMapClickFromPinPress({ pinPressedAt: 1000, now: 1000 + PIN_PRESS_MAP_CLICK_WINDOW_MS - 1 })).toBe(true);
  });

  it("시간이 지나서 온 지도 누름은 빈 곳을 누른 것으로 본다", () => {
    expect(isMapClickFromPinPress({ pinPressedAt: 1000, now: 1000 + PIN_PRESS_MAP_CLICK_WINDOW_MS })).toBe(false);
  });

  it("핀을 누른 적이 없으면 빈 곳을 누른 것으로 본다", () => {
    expect(isMapClickFromPinPress({ pinPressedAt: undefined, now: 0 })).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { toSlidePhotoLoad } from "./detail-photo-loading";

describe("toSlidePhotoLoad", () => {
  it("지금 보는 사진은 받은 것과 상관없이 바로 받는다", () => {
    expect(toSlidePhotoLoad({ index: 2, selectedIndex: 2, isSelectedShown: false })).toBe("now");
    expect(toSlidePhotoLoad({ index: 2, selectedIndex: 2, isSelectedShown: true })).toBe("now");
  });

  it("지금 사진을 다 받기 전에는 앞뒤 사진도 받지 않는다", () => {
    expect(toSlidePhotoLoad({ index: 1, selectedIndex: 2, isSelectedShown: false })).toBe("later");
    expect(toSlidePhotoLoad({ index: 3, selectedIndex: 2, isSelectedShown: false })).toBe("later");
  });

  it("지금 사진을 다 받으면 앞뒤 한 장씩만 미리 받는다", () => {
    expect(toSlidePhotoLoad({ index: 1, selectedIndex: 2, isSelectedShown: true })).toBe("next");
    expect(toSlidePhotoLoad({ index: 3, selectedIndex: 2, isSelectedShown: true })).toBe("next");
    expect(toSlidePhotoLoad({ index: 0, selectedIndex: 2, isSelectedShown: true })).toBe("later");
    expect(toSlidePhotoLoad({ index: 4, selectedIndex: 2, isSelectedShown: true })).toBe("later");
  });
});

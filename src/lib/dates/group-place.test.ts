import { describe, expect, it } from "vitest";
import { toGroupPlaceLabel } from "./group-place";

describe("toGroupPlaceLabel", () => {
  it("직접 붙인 장소 이름이 있으면 그 이름을 쓴다", () => {
    expect(toGroupPlaceLabel({ place: "성동구 성수1가1동", place_name: "골목 끝 카페" })).toBe("골목 끝 카페");
  });

  it("장소 이름이 없거나 비어 있으면 행정동 이름을 다듬어 쓴다", () => {
    expect(toGroupPlaceLabel({ place: "성동구 성수1가1동", place_name: null })).toBe("성수동");
    expect(toGroupPlaceLabel({ place: "성동구 성수1가1동", place_name: "  " })).toBe("성수동");
  });
});

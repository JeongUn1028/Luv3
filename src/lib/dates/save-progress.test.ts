import { describe, expect, it } from "vitest";
import { toSaveProgressLabel, toSaveProgressRatio } from "./save-progress";

describe("toSaveProgressLabel", () => {
  it("사진을 올리는 동안은 다 올린 장수와 전체 장수를 보여 준다", () => {
    expect(toSaveProgressLabel({ step: "uploading", done: 0, total: 30 })).toBe("사진 올리는 중… 0/30");
    expect(toSaveProgressLabel({ step: "uploading", done: 14, total: 30 })).toBe("사진 올리는 중… 14/30");
  });

  it("사진을 다 올리고 기록을 저장하는 동안은 기록 저장 중이라고 보여 준다", () => {
    expect(toSaveProgressLabel({ step: "saving", done: 30, total: 30 })).toBe("기록 저장 중…");
  });
});

describe("toSaveProgressRatio", () => {
  it("사진을 올리는 동안은 다 올린 비율만큼 찬다", () => {
    expect(toSaveProgressRatio({ step: "uploading", done: 0, total: 4 })).toBe(0);
    expect(toSaveProgressRatio({ step: "uploading", done: 1, total: 4 })).toBe(0.25);
  });

  it("기록을 저장하는 동안과 올릴 사진이 없을 때는 다 찬다", () => {
    expect(toSaveProgressRatio({ step: "saving", done: 0, total: 0 })).toBe(1);
    expect(toSaveProgressRatio({ step: "uploading", done: 0, total: 0 })).toBe(1);
  });

  it("장수가 전체보다 많아도 넘치지 않는다", () => {
    expect(toSaveProgressRatio({ step: "uploading", done: 5, total: 4 })).toBe(1);
  });
});

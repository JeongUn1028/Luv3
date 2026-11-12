import { describe, expect, it } from "vitest";
import { toGroupName } from "./group-name";

describe("toGroupName", () => {
  it("조사가 없으면 모음 이름만 돌려준다", () => {
    expect(toGroupName(1)).toBe("모음 1");
  });

  it("숫자를 읽은 소리의 받침에 맞춰 과/와를 붙인다", () => {
    expect(Array.from({ length: 10 }, (_, index) => toGroupName(index + 1, "와"))).toEqual([
      "모음 1과",
      "모음 2와",
      "모음 3과",
      "모음 4와",
      "모음 5와",
      "모음 6과",
      "모음 7과",
      "모음 8과",
      "모음 9와",
      "모음 10과",
    ]);
  });

  it("을/를도 같은 규칙으로 붙인다", () => {
    expect([toGroupName(2, "을"), toGroupName(3, "을")]).toEqual(["모음 2를", "모음 3을"]);
  });
});

import { describe, expect, it } from "vitest";
import { toAuthorInitials } from "@/lib/author";

describe("toAuthorInitials", () => {
  it("닉네임이 2글자 이하면 그대로 쓴다", () => {
    expect(toAuthorInitials("정운")).toBe("정운");
    expect(toAuthorInitials("진")).toBe("진");
  });

  it("2글자보다 길면 뒤 2글자만 쓴다", () => {
    expect(toAuthorInitials("김정운")).toBe("정운");
    expect(toAuthorInitials("Jinah")).toBe("ah");
  });

  it("앞뒤 공백은 글자로 세지 않는다", () => {
    expect(toAuthorInitials(" 김정운 ")).toBe("정운");
  });

  it("이모지처럼 여러 코드로 된 글자도 반으로 자르지 않는다", () => {
    expect(toAuthorInitials("정운👩‍❤️‍👨")).toBe("운👩‍❤️‍👨");
    expect(toAuthorInitials("우리🇰🇷")).toBe("리🇰🇷");
  });
});

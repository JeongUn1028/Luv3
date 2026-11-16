import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const read = (relativePath: string): string => readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");

// 홈 첫 화면 코드에 사진 줄이기 라이브러리(browser-image-compression, 약 57KB)가 들어가지 않게 고정한다(#344).
// 정적 import가 하나라도 생기면 번들러가 홈 코드에 함께 넣는다
describe("홈 커플 사진 코드", () => {
  it("사진 줄이기 모듈을 바로 불러오지 않고 고른 뒤에 import()로 받는다", () => {
    // Arrange
    const source = read("./CouplePhoto.tsx");

    // Assert
    expect(source).not.toMatch(/^import [^;]*from "@\/lib\/photos\/resize";/m);
    expect(source).toContain('import("@/lib/photos/resize")');
  });

  it("사진 형식 검사는 라이브러리를 불러오지 않는 작은 모듈에 있다", () => {
    // Arrange
    const source = read("../../lib/photos/accepted.ts");

    // Assert
    expect(source).not.toMatch(/^import /m);
  });
});

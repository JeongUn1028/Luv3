import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { IMAGE_COMPRESSION_LIB_PATH, toImageCompressionLibUrl } from "./compression-lib";

const require = createRequire(import.meta.url);
const readPackageJson = (path: string): { version?: string; dependencies?: Record<string, string> } =>
  JSON.parse(readFileSync(path, "utf8"));

describe("browser-image-compression 사본", () => {
  // 워커가 불러오는 사본과 화면에서 쓰는 라이브러리 버전이 다르면 옵션 처리가 어긋날 수 있다
  it("사본 파일 이름은 설치한 라이브러리 버전과 같다", () => {
    // Arrange
    const installed = readPackageJson(require.resolve("browser-image-compression/package.json")).version;
    const declared = readPackageJson("package.json").dependencies?.["browser-image-compression"];

    // Assert
    expect(declared).toBe(installed);
    expect(IMAGE_COMPRESSION_LIB_PATH).toBe(`/vendor/browser-image-compression-${installed}.js`);
  });

  it("사본은 설치한 라이브러리의 UMD 파일과 내용이 같다", () => {
    // Arrange
    const copy = readFileSync(`public${IMAGE_COMPRESSION_LIB_PATH}`);
    const installed = readFileSync(require.resolve("browser-image-compression/dist/browser-image-compression.js"));

    // Assert
    expect(copy.equals(installed)).toBe(true);
  });
});

describe("toImageCompressionLibUrl", () => {
  it("페이지 주소의 origin에 사본 경로를 붙인 전체 주소를 만든다", () => {
    expect(toImageCompressionLibUrl("https://luv3.test")).toBe("https://luv3.test/vendor/browser-image-compression-2.0.2.js");
  });
});

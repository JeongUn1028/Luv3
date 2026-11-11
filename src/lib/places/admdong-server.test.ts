import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import nextConfig from "../../../next.config";
import { ADMDONG_SOURCE } from "./admdong";
import { ADMDONG_FILE_PATH, loadAdmdongBoundaries } from "./admdong-server";

vi.mock("server-only", () => ({}));

describe("loadAdmdongBoundaries", () => {
  // 로컬 `next start`는 리포에서 바로 읽어 빠져도 모른다. Vercel 서버 함수에는 따라 들어간 파일만 있어 운영에서만 실패한다
  it("경계 파일을 동네 이름 경로의 서버 함수에 함께 싣는다", () => {
    expect(nextConfig.outputFileTracingIncludes?.["/api/places/region"]).toContain(`./${ADMDONG_FILE_PATH}`);
  });

  // 설정 화면의 출처 문구가 실제로 실린 판을 가리키게 한다(CC BY 4.0 출처 표시)
  it("경계 파일의 원본 판이 출처 문구의 판과 같다", () => {
    const file: unknown = JSON.parse(readFileSync(ADMDONG_FILE_PATH, "utf8"));
    expect(file).toMatchObject({ source: ADMDONG_SOURCE });
  });

  it("리포의 경계 파일을 한 번만 읽어 같은 결과를 돌려준다", async () => {
    // Arrange
    expect(existsSync(ADMDONG_FILE_PATH)).toBe(true);

    // Act
    const [first, second] = await Promise.all([loadAdmdongBoundaries(), loadAdmdongBoundaries()]);

    // Assert
    expect(second).toBe(first);
    expect(first.regions.length).toBeGreaterThan(3000);
  });
});

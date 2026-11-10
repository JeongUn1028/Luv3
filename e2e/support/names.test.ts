import { readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { createTestName } from "./names";
import { listSpecPaths } from "./spec-files";

const E2E_DIR = join(import.meta.dirname, "..");

describe("테스트 데이터 이름", () => {
  it("같은 이름표와 기기로 두 번 만들면 서로 다른 이름이 나온다", () => {
    // Arrange
    const project = { name: "iphone-15-pro" };

    // Act
    const first = createTestName("E2E 저장", { project });
    const second = createTestName("E2E 저장", { project });

    // Assert
    expect(first).not.toBe(second);
  });

  it("이름표와 기기 이름을 앞에 담아 남은 데이터가 어느 테스트 것인지 알 수 있다", () => {
    // Act
    const name = createTestName("E2E 저장", { project: { name: "iphone-17" } });

    // Assert
    expect(name).toMatch(/^E2E 저장 iphone-17 [0-9a-f]{8}$/);
  });

  it("스펙 파일은 기기 이름을 직접 붙여 이름을 만들지 않는다", () => {
    // 기기 이름만 붙인 이름은 다시 돌리거나 실행이 겹치면 남은 데이터와 부딪친다(#242)
    const offenders = listSpecPaths().filter((path) => readFileSync(path, "utf8").includes("${testInfo.project.name")).map((path) =>
      relative(E2E_DIR, path),
    );

    expect(offenders).toEqual([]);
  });
});

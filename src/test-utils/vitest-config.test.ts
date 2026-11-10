import { execFileSync } from "node:child_process";
import { join, matchesGlob } from "node:path";
import { describe, expect, it } from "vitest";
import config from "../../vitest.config";

const ROOT = join(import.meta.dirname, "..", "..");

const include = config.test?.include ?? [];

/** git이 관리하는(무시하지 않는) 파일 중 테스트 파일. 빌드 결과·보고서·다른 작업 폴더는 빠진다 */
const listTestFiles = (): string[] =>
  execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], { cwd: ROOT, encoding: "utf8" })
    .split("\n")
    .filter((path) => /\.test\.(ts|tsx|mts)$/.test(path));

const isIncluded = (path: string): boolean => include.some((pattern) => matchesGlob(path, pattern));

describe("vitest가 실행할 테스트 파일", () => {
  // include에 없는 확장자로 테스트를 만들면 오류 없이 건너뛰어, 통과한 것처럼 보인다(#256)
  it.each(["src/components/Example.test.ts", "src/components/Example.test.tsx", "scripts/backup/example.test.ts"])(
    "%s 같은 파일을 실행 대상으로 받는다",
    (path) => {
      expect(isIncluded(path)).toBe(true);
    },
  );

  it("리포에 있는 테스트 파일을 하나도 빠뜨리지 않는다", () => {
    const testFiles = listTestFiles();

    expect(testFiles.length).toBeGreaterThan(0);
    expect(testFiles.filter((path) => !isIncluded(path))).toEqual([]);
  });
});

describe("커버리지 바닥값", () => {
  it("로직 폴더 src/lib의 바닥값은 줄 75%·분기 80%보다 낮아지지 않는다", () => {
    // 화면 코드는 E2E가 확인해 단위 테스트 수치가 낮다. 로직만 바닥값을 두어 테스트 없는 로직이 늘면 CI가 잡는다(#256)
    const thresholds = config.test?.coverage?.thresholds ?? {};
    const libThreshold = "src/lib/**" in thresholds ? thresholds["src/lib/**"] : undefined;
    const isObject = typeof libThreshold === "object" && libThreshold !== null;
    const lines = isObject && "lines" in libThreshold ? libThreshold.lines : undefined;
    const branches = isObject && "branches" in libThreshold ? libThreshold.branches : undefined;

    expect(lines).toBeGreaterThanOrEqual(75);
    expect(branches).toBeGreaterThanOrEqual(80);
  });
});

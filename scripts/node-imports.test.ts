import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// scripts/는 Node로 바로 실행한다(storage-check는 GitHub Actions에서 의존성 설치 없이 돈다).
// vitest와 tsc는 `@/` 별칭과 확장자 없는 경로를 풀어 주지만 Node는 못 풀어, 깨져도 CI가 아닌 실행할 때에야 드러난다

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// `import type`은 Node가 지우므로 보지 않는다
const RUNTIME_IMPORT = /^import (?!type )[^;]*?from "([^"]+)";/gm;

const listScripts = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return listScripts(path);
    return entry.name.endsWith(".mts") ? [path] : [];
  });

/** 스크립트에서 시작해 Node가 실제로 불러오는 이 리포 파일과 그 안의 불러오기 경로 */
const collectImports = (entries: string[]): { file: string; specifier: string }[] => {
  const seen = new Set<string>();
  const found: { file: string; specifier: string }[] = [];
  const visit = (file: string): void => {
    if (seen.has(file)) return;
    seen.add(file);
    for (const [, specifier = ""] of readFileSync(file, "utf8").matchAll(RUNTIME_IMPORT)) {
      found.push({ file: relative(ROOT, file).replaceAll("\\", "/"), specifier });
      if (specifier.startsWith(".")) visit(resolve(dirname(file), specifier));
    }
  };
  entries.forEach(visit);
  return found;
};

describe("scripts가 Node로 불러오는 파일", () => {
  const imports = collectImports(listScripts(join(ROOT, "scripts")));

  it("src 파일까지 따라가도 `@/` 별칭을 쓰지 않는다", () => {
    expect(imports.filter(({ specifier }) => specifier.startsWith("@/"))).toEqual([]);
  });

  it("리포 안 파일은 확장자까지 적는다", () => {
    expect(imports.filter(({ specifier }) => specifier.startsWith(".") && !/\.m?ts$/.test(specifier))).toEqual([]);
  });

  it("src/lib/guards.ts를 실제로 따라간다", () => {
    expect(imports.some(({ specifier }) => specifier.endsWith("src/lib/guards.ts") || specifier.endsWith("../guards.ts"))).toBe(true);
  });
});

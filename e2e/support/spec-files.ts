import { readdirSync } from "node:fs";
import { join } from "node:path";

const E2E_DIR = join(import.meta.dirname, "..");

/** Playwright가 스펙으로 찾는 파일 끝 이름(`playwright.config.ts`의 `testMatch`) */
export const SPEC_SUFFIX = ".spec.ts";

/**
 * e2e 아래 모든 스펙의 절대 경로. Playwright가 하위 폴더까지 찾으므로 여기서도 하위 폴더를 본다.
 * 스펙 파일을 검사하는 단위 테스트들이 같은 목록을 보게 한곳에서 찾는다.
 *
 * @example listSpecPaths().map((path) => basename(path, SPEC_SUFFIX))
 */
export const listSpecPaths = (): string[] =>
  readdirSync(E2E_DIR, { recursive: true, encoding: "utf8" })
    .filter((path) => path.endsWith(SPEC_SUFFIX))
    .map((path) => join(E2E_DIR, path));

import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

/** 소스 검사 테스트가 훑는 `src` 폴더 */
const SRC_DIR = fileURLToPath(new URL("..", import.meta.url));

/** `src` 아래 `.ts`·`.tsx`·`.css` 파일 경로를 모은다. 테스트 파일은 뺀다 */
const listSourceFiles = (dir: string = SRC_DIR): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return listSourceFiles(path);
    return /\.(tsx?|css)$/.test(entry.name) && !entry.name.includes(".test.") ? [path] : [];
  });

/** 주석의 설명은 검사하지 않도록 지운다. 줄 번호가 유지되도록 블록 주석은 줄바꿈만 남긴다 */
const stripComments = (source: string): string =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ""))
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

/** `src` 기준 상대 경로와 주석을 지운 줄 목록 */
export interface SourceLines {
  at: string;
  lines: string[];
}

// 한 테스트 파일 안에서 여러 번 불려도 src 전체는 한 번만 읽는다
let cachedSourceLines: SourceLines[] | undefined;

/**
 * `src` 아래 소스 파일을 주석을 지운 줄 단위로 읽는다. 경로는 `/`로 맞춘다.
 *
 * @example readSourceLines().find(({ at }) => at === "app/globals.css")
 */
export const readSourceLines = (): SourceLines[] =>
  (cachedSourceLines ??= listSourceFiles().map((path) => ({
    at: relative(SRC_DIR, path).replaceAll("\\", "/"),
    lines: stripComments(readFileSync(path, "utf8")).split("\n"),
  })));

/**
 * `src` 기준 경로의 파일을 주석을 지워 읽는다.
 *
 * @example readSource("app/globals.css")
 */
export const readSource = (at: string): string => stripComments(readFileSync(join(SRC_DIR, at), "utf8"));

import path from "node:path";

const MIGRATIONS_FOLDER = "supabase/migrations/";
const APPLY_TITLE = "운영 반영";
const HEADING = /^(#{1,6})\s+(.*)$/;
const CODE_FENCE = /^\s*(?:```|~~~)/;
// 닫지 않은 주석도 GitHub 화면에서는 끝까지 숨는다
const HTML_COMMENT = /<!--[\s\S]*?(?:-->|$)/g;
const CHECKED_ITEM = /^\s*(?:[-*+]|\d+[.)])\s+\[[xX]\]\s/;

/**
 * PR에서 바뀐 경로 중 마이그레이션 SQL 파일의 이름만 고른다.
 *
 * @example findMigrationFiles(["supabase/migrations/1_a.sql", "README.md"]) // ["1_a.sql"]
 */
export const findMigrationFiles = (changedPaths: string[]): string[] =>
  changedPaths
    .filter((changedPath) => changedPath.startsWith(MIGRATIONS_FOLDER) && changedPath.endsWith(".sql"))
    .map((changedPath) => path.posix.basename(changedPath));

// 화면에 체크칸으로 보이는 것만 인정한다. 코드 블록째 붙여 넣은 예시가 반영 표시로 통과하면 안 된다
const readCheckedApplyLines = (body: string): string[] => {
  const checkedLines: string[] = [];
  let sectionLevel: number | undefined;
  let isInCodeBlock = false;
  for (const line of body.replace(HTML_COMMENT, "").split(/\r?\n/)) {
    if (CODE_FENCE.test(line)) {
      isInCodeBlock = !isInCodeBlock;
      continue;
    }
    if (isInCodeBlock) continue;

    const heading = HEADING.exec(line);
    if (heading) {
      const [, marks = "", title = ""] = heading;
      if (title.startsWith(APPLY_TITLE)) {
        sectionLevel = marks.length;
      } else if (sectionLevel !== undefined && marks.length <= sectionLevel) {
        sectionLevel = undefined;
      }
    } else if (sectionLevel !== undefined && CHECKED_ITEM.test(line)) {
      checkedLines.push(line);
    }
  }
  return checkedLines;
};

/**
 * PR 본문의 "운영 반영" 칸에 체크된 줄이 없는 파일을 돌려준다. 체크한 뒤 마이그레이션이 늘어도 잡도록 파일마다 확인한다.
 * 파일 이름은 PR #185 형식대로 백틱으로 감싸야 한다.
 *
 * @example findUncheckedFiles("## 운영 반영\n- [x] `1_a.sql` 반영", ["1_a.sql", "2_b.sql"]) // ["2_b.sql"]
 */
export const findUncheckedFiles = (body: string, files: string[]): string[] => {
  const checkedLines = readCheckedApplyLines(body);
  return files.filter((file) => !checkedLines.some((line) => line.includes(`\`${file}\``)));
};

/**
 * 확인에 실패했을 때 보여 줄 안내. 체크칸은 비워 두어, 복사만으로는 통과하지 않고 반영한 사람이 직접 체크하게 한다.
 *
 * @example formatApplyGuide(["1_a.sql"])
 */
export const formatApplyGuide = (files: string[]): string =>
  [
    "이 PR은 supabase/migrations/를 바꾸는데 운영 반영 체크가 없습니다.",
    "머지하면 바로 배포되므로, README의 'DB를 바꾸는 PR' 순서대로 운영 DB에 먼저 반영하세요.",
    "그런 다음 PR 본문에 아래 칸을 넣고 체크하면 다시 확인합니다.",
    "",
    `## ${APPLY_TITLE}`,
    ...files.map((file) => `- [ ] 머지 전에 \`pnpm exec supabase db push --linked\`로 \`${file}\` 반영`),
  ].join("\n");

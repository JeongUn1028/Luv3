import { describe, expect, it } from "vitest";
import { findMigrationFiles, findUncheckedFiles, formatApplyGuide } from "./lib.mts";

const FILE = "20261106050000_date_record_revision.sql";
const CHECKED_LINE = `- [x] 머지 전에 \`pnpm exec supabase db push --linked\`로 \`${FILE}\` 반영`;

describe("findMigrationFiles", () => {
  it("마이그레이션 폴더의 파일만 이름으로 돌려준다", () => {
    expect(
      findMigrationFiles([
        `supabase/migrations/${FILE}`,
        "supabase/tests/date_records.test.sql",
        "src/supabase/migrations/other.sql",
        "supabase/migrations/.gitkeep",
        "README.md",
      ]),
    ).toEqual([FILE]);
  });
});

describe("findUncheckedFiles", () => {
  it("PR #185 형식으로 체크하면 빠진 파일이 없다", () => {
    const body = `## 관련 이슈\nCloses #158\n\n## 운영 반영\n${CHECKED_LINE}\n\n## 고치지 않은 리뷰 지적\n- 없음`;

    expect(findUncheckedFiles(body, [FILE])).toEqual([]);
  });

  it("웹에서 고친 본문처럼 줄바꿈이 CRLF여도 체크를 찾는다", () => {
    const body = `## 운영 반영\r\n${CHECKED_LINE}\r\n`;

    expect(findUncheckedFiles(body, [FILE])).toEqual([]);
  });

  it("체크하지 않은 칸은 반영으로 보지 않는다", () => {
    const body = `## 운영 반영\n${CHECKED_LINE.replace("[x]", "[ ]")}`;

    expect(findUncheckedFiles(body, [FILE])).toEqual([FILE]);
  });

  it("운영 반영 칸 밖의 체크는 반영으로 보지 않는다", () => {
    const body = `## 테스트 방법\n${CHECKED_LINE}\n\n## 운영 반영\n- 아직 안 함`;

    expect(findUncheckedFiles(body, [FILE])).toEqual([FILE]);
  });

  it("다음 제목 뒤의 체크는 운영 반영 칸으로 보지 않는다", () => {
    const body = `## 운영 반영\n\n## 체크리스트\n${CHECKED_LINE}`;

    expect(findUncheckedFiles(body, [FILE])).toEqual([FILE]);
  });

  it("체크한 뒤 마이그레이션이 늘면 새 파일만 빠졌다고 알려 준다", () => {
    const added = "20261107000000_added_later.sql";
    const body = `## 운영 반영\n${CHECKED_LINE}`;

    expect(findUncheckedFiles(body, [FILE, added])).toEqual([added]);
  });

  it("본문이 비어 있으면 모든 파일이 빠진 것이다", () => {
    expect(findUncheckedFiles("", [FILE])).toEqual([FILE]);
  });

  it("코드 블록 안의 체크는 화면에 체크칸으로 보이지 않으므로 반영으로 보지 않는다", () => {
    const body = `## 운영 반영\n\`\`\`markdown\n${CHECKED_LINE}\n\`\`\``;

    expect(findUncheckedFiles(body, [FILE])).toEqual([FILE]);
  });

  it("HTML 주석 안의 체크는 반영으로 보지 않는다", () => {
    expect(findUncheckedFiles(`<!--\n## 운영 반영\n${CHECKED_LINE}\n-->`, [FILE])).toEqual([FILE]);
    expect(findUncheckedFiles(`## 운영 반영\n<!-- ${CHECKED_LINE}`, [FILE])).toEqual([FILE]);
  });

  it("칸 안의 코드 블록에 있는 # 주석은 칸을 닫지 않는다", () => {
    const body = `## 운영 반영\n\`\`\`bash\n# 운영 DB에 반영\n\`\`\`\n${CHECKED_LINE}`;

    expect(findUncheckedFiles(body, [FILE])).toEqual([]);
  });

  it("칸 안의 하위 제목은 칸을 닫지 않는다", () => {
    const body = `## 운영 반영\n### 11월 6일\n${CHECKED_LINE}`;

    expect(findUncheckedFiles(body, [FILE])).toEqual([]);
  });

  it("제목 뒤에 글이 붙어도 운영 반영 칸으로 본다", () => {
    expect(findUncheckedFiles(`## 운영 반영 (완료)\n${CHECKED_LINE}`, [FILE])).toEqual([]);
  });

  it("번호 목록의 체크도 반영으로 본다", () => {
    const body = `## 운영 반영\n${CHECKED_LINE.replace("- [x]", "1. [x]")}`;

    expect(findUncheckedFiles(body, [FILE])).toEqual([]);
  });

  it("이름이 더 긴 다른 파일의 체크는 이 파일의 체크로 보지 않는다", () => {
    expect(findUncheckedFiles("## 운영 반영\n- [x] `11_a.sql` 반영", ["1_a.sql"])).toEqual(["1_a.sql"]);
  });
});

describe("formatApplyGuide", () => {
  it("직접 체크해야 통과하도록 빈 체크칸을 보여 준다", () => {
    const guide = formatApplyGuide([FILE]);

    expect(guide).toContain("## 운영 반영");
    expect(findUncheckedFiles(guide, [FILE])).toEqual([FILE]);
    expect(findUncheckedFiles(guide.replace("- [ ]", "- [x]"), [FILE])).toEqual([]);
  });
});

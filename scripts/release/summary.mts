// 만든 Release 노트 맨 위에 쉬운 글 요약을 넣는다(#361). 앱 정보 화면의 업데이트 기록(#404·#434)이 이 요약을 읽는다.
// 쓰는 법: pnpm release:summary v1.3.0 <요약 파일>
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { addReleaseSummary } from "./lib.mts";

const [tag, summaryPath] = process.argv.slice(2);
if (!tag || !summaryPath) {
  console.error("쓰는 법: pnpm release:summary v1.3.0 <요약 파일>");
  process.exit(1);
}

const body = execFileSync("gh", ["release", "view", tag, "--json", "body", "--jq", ".body"], { encoding: "utf8" }).replace(/\n$/, "");
// Windows 편집기로 쓴 요약의 줄 끝(CRLF)을 노트와 같게 맞춘다
const summary = readFileSync(summaryPath, "utf8").replaceAll("\r\n", "\n");
const directory = mkdtempSync(join(tmpdir(), "luv3-release-"));
try {
  const notesPath = join(directory, "notes.md");
  writeFileSync(notesPath, addReleaseSummary({ body, summary }));
  execFileSync("gh", ["release", "edit", tag, "--notes-file", notesPath], { stdio: "inherit" });
} finally {
  rmSync(directory, { recursive: true, force: true });
}
console.log(`${tag} 노트에 요약을 넣었습니다`);

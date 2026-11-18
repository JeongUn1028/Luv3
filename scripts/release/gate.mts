// 앞 태그 뒤에 사용자에게 보이는 변경(feat·fix·perf·revert)이 있는지 보고 release-please에 알린다(#361).
// release-please는 changelog-type: github일 때 커밋 종류로 거르지 않아, 여기서 막지 않으면 refactor·chore만으로도 릴리스 PR이 생긴다
import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";
import { hasUserFacingCommits } from "./lib.mts";

const manifest = JSON.parse(readFileSync(".release-please-manifest.json", "utf8")) as Record<string, unknown>;
const version = manifest["."];
if (typeof version !== "string") throw new Error(".release-please-manifest.json에 지금 버전이 없습니다");

const tag = `v${version}`;
const subjects = execFileSync("git", ["log", `${tag}..HEAD`, "--format=%s"], { encoding: "utf8" })
  .split("\n")
  .filter((subject) => subject !== "");
const shouldSkip = !hasUserFacingCommits(subjects);
console.log(`${tag} 뒤 커밋 ${subjects.length}개, 사용자에게 보이는 변경 ${shouldSkip ? "없음 → 릴리스 PR을 만들지 않는다" : "있음"}`);

const output = process.env.GITHUB_OUTPUT;
if (!output) throw new Error("GITHUB_OUTPUT이 없습니다(GitHub Actions에서만 실행한다)");
appendFileSync(output, `skip-pull-request=${shouldSkip}\n`);

// 앞 태그 뒤에 사용자에게 보이는 변경(feat·fix·perf·revert)이 있는지 보고 release-please에 알린다(#361).
// release-please는 changelog-type: github일 때 커밋 종류로 거르지 않아, 여기서 막지 않으면 refactor·chore만으로도 릴리스 PR이 생긴다
import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";
import { decideReleaseGate } from "./lib.mts";

const MANIFEST_FILE = ".release-please-manifest.json";

const manifest = JSON.parse(readFileSync(MANIFEST_FILE, "utf8")) as Record<string, unknown>;
const version = manifest["."];
if (typeof version !== "string") throw new Error(`${MANIFEST_FILE}에 지금 버전이 없습니다`);

const tag = `v${version}`;

const git = (args: string[]): string => execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

const hasTag = (name: string): boolean => {
  try {
    git(["rev-parse", "--quiet", "--verify", `refs/tags/${name}`]);
    return true;
  } catch (error) {
    // --verify --quiet은 태그가 없을 때만 1로 끝난다. git이 없거나 저장소가 아닌 경우 같은 다른 실패는 그대로 알린다
    if (typeof error === "object" && error !== null && "status" in error && error.status === 1) return false;
    throw error;
  }
};

const readSubjectsSince = (name: string): string[] =>
  git(["log", `${name}..HEAD`, "--format=%s"])
    .split("\n")
    .filter((subject) => subject !== "");

// 릴리스 PR은 기록 파일을 바꾸는 유일한 커밋이다(check-pr.mts가 그 PR이 두 파일만 바꾸는지 확인한다)
const isReleaseCommit = git(["diff-tree", "--no-commit-id", "--name-only", "-r", "HEAD"]).split("\n").includes(MANIFEST_FILE);

const { shouldSkipPullRequest, message } = decideReleaseGate({ tag, subjects: hasTag(tag) ? readSubjectsSince(tag) : undefined, isReleaseCommit });
console.log(message);

const output = process.env.GITHUB_OUTPUT;
if (!output) throw new Error("GITHUB_OUTPUT이 없습니다(GitHub Actions에서만 실행한다)");
appendFileSync(output, `skip-pull-request=${shouldSkipPullRequest}\n`);

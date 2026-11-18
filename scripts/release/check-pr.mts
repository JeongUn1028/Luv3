// 릴리스 PR에 버전 숫자·기록 파일 말고 다른 변경이 들어가지 않았는지 본다(#361). release-please 워크플로가 PR을 만들거나 고친 뒤 부른다
import { findUnexpectedReleaseChanges, type ReleasePullRequestFile } from "./lib.mts";

const PAGE_SIZE = 100;

const readEnv = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`환경 변수 ${name}이 없습니다`);
  return value;
};

const fetchFiles = async (number: string): Promise<ReleasePullRequestFile[]> => {
  const response = await fetch(`${readEnv("GITHUB_API_URL")}/repos/${readEnv("GITHUB_REPOSITORY")}/pulls/${number}/files?per_page=${PAGE_SIZE}`, {
    headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${readEnv("GITHUB_TOKEN")}` },
  });
  if (!response.ok) throw new Error(`PR #${number}의 파일 목록을 받지 못했습니다: HTTP ${response.status}`);
  const files = (await response.json()) as ReleasePullRequestFile[];
  return files.map(({ filename, patch }) => ({ filename, patch }));
};

const number = readEnv("RELEASE_PR_NUMBER");
const unexpected = findUnexpectedReleaseChanges(await fetchFiles(number));
if (unexpected.length > 0) {
  console.error(`릴리스 PR #${number}에 버전 숫자·기록 파일 말고 다른 변경이 있습니다. 관리자 권한으로 머지하지 말고 살펴보세요:\n${unexpected.join("\n")}`);
  process.exit(1);
}
console.log(`릴리스 PR #${number}는 버전 숫자와 기록 파일만 바꿉니다`);

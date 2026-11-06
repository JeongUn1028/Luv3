import { readFileSync } from "node:fs";
import { findMigrationFiles, findUncheckedFiles, formatApplyGuide } from "./lib.mts";

const PAGE_SIZE = 100;

interface PullRequestEvent {
  pull_request: { number: number };
}

interface PullRequest {
  body: string | null;
}

interface PullRequestFile {
  filename: string;
}

const readEnv = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`환경 변수 ${name}이 없습니다`);
  return value;
};

const fetchFromGitHub = async <T,>(pathAndQuery: string): Promise<T> => {
  const response = await fetch(`${readEnv("GITHUB_API_URL")}/repos/${readEnv("GITHUB_REPOSITORY")}/${pathAndQuery}`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${readEnv("GITHUB_TOKEN")}`,
    },
  });
  if (!response.ok) throw new Error(`GitHub 응답 ${response.status}: ${pathAndQuery}`);
  return (await response.json()) as T;
};

const fetchChangedPaths = async (pullNumber: number): Promise<string[]> => {
  const changedPaths: string[] = [];
  for (let page = 1; ; page += 1) {
    const files = await fetchFromGitHub<PullRequestFile[]>(
      `pulls/${pullNumber}/files?per_page=${PAGE_SIZE}&page=${page}`,
    );
    changedPaths.push(...files.map((file) => file.filename));
    if (files.length < PAGE_SIZE) return changedPaths;
  }
};

const checkPullRequest = async (): Promise<number> => {
  const event = JSON.parse(readFileSync(readEnv("GITHUB_EVENT_PATH"), "utf8")) as PullRequestEvent;
  const pullNumber = event.pull_request.number;

  const migrationFiles = findMigrationFiles(await fetchChangedPaths(pullNumber));
  if (migrationFiles.length === 0) {
    console.log("마이그레이션 변경이 없어 확인할 것이 없습니다");
    return 0;
  }

  // 이벤트 파일의 본문은 그 실행을 시작할 때의 것이라, 본문을 고친 뒤 다시 실행해도 옛 본문을 읽는다
  const { body } = await fetchFromGitHub<PullRequest>(`pulls/${pullNumber}`);
  const uncheckedFiles = findUncheckedFiles(body ?? "", migrationFiles);
  if (uncheckedFiles.length > 0) {
    console.error(formatApplyGuide(uncheckedFiles));
    return 1;
  }

  console.log(`운영 반영 체크 확인: ${migrationFiles.join(", ")}`);
  return 0;
};

try {
  process.exitCode = await checkPullRequest();
} catch (error) {
  // 체크 누락과 구분되도록 알린다. 확인하지 못했으므로 통과시키지 않는다
  const message = error instanceof Error ? error.message : String(error);
  console.error(`운영 반영 여부를 확인하지 못했습니다. 잠시 뒤 다시 실행해 주세요. (${message})`);
  process.exitCode = 1;
}

// 릴리스 자동화(#361)의 판단. GitHub를 부르는 일은 check-pr.mts·summary.mts가 맡고, 여기는 단위 테스트로 확인한다

/** GitHub 자동 목록의 시작. 앱 정보 화면(`src/lib/app-info/releases.ts`)도 이 줄 앞만 요약으로 읽는다 */
const AUTO_LIST_START = /^##\s+What's Changed/m;
/** release-please가 노트 맨 위에 붙이는 버전 제목(예: `## 1.3.0 (2026-11-20)`) */
const VERSION_HEADING = /^## \S+ \(\d{4}-\d{2}-\d{2}\)$/;

export interface AddReleaseSummaryParams {
  /** 지금 Release 노트 */
  body: string;
  /** 사람이 쉬운 글로 쓴 요약. `- **이름**: 글` 줄은 앱에서 이름을 굵게 보여 준다 */
  summary: string;
}

/**
 * Release 노트의 자동 목록(`## What's Changed`) 앞에 요약을 넣는다. 버전 제목은 맨 위에 두고, 전에 넣은 요약은 새 요약으로 바꾼다.
 * 앱 정보 화면의 업데이트 기록(#404·#434)이 자동 목록 앞부분을 읽으므로 그 구분을 지킨다.
 *
 * @example addReleaseSummary({ body: release.body, summary: "- **할 일**: 연달아 옮길 수 있어요" })
 */
export const addReleaseSummary = ({ body, summary }: AddReleaseSummaryParams): string => {
  const start = AUTO_LIST_START.exec(body)?.index;
  if (start === undefined) throw new Error("노트에 자동 목록(## What's Changed)이 없어 요약을 넣을 자리를 모릅니다");
  const trimmed = summary.trim();
  if (AUTO_LIST_START.test(trimmed)) throw new Error("요약에 자동 목록 제목(## What's Changed)이 있으면 앱이 그 앞까지만 읽습니다");
  // 제목 줄은 앱에서 보이지 않아, 제목만 있는 요약은 빈 요약과 같다
  if (!trimmed.split(/\r?\n/).some((line) => line.trim() !== "" && !line.trim().startsWith("#"))) throw new Error("요약이 비어 있습니다");
  const heading = body
    .slice(0, start)
    .split(/\r?\n/)
    .find((line) => VERSION_HEADING.test(line.trim()));
  return [heading?.trim(), trimmed, body.slice(start)].filter((part) => part !== undefined).join("\n\n");
};

/** 릴리스 PR이 바꿔도 되는 기록 파일. 이 파일은 버전 하나만 담는다 */
const MANIFEST_FILE = ".release-please-manifest.json";
const PACKAGE_FILE = "package.json";
/** package.json에서 바뀌어도 되는 줄: 맨 위 `"version"` 한 줄 */
const VERSION_LINE = /^[+-] {2}"version": "[^"]+",?$/;

export interface ReleasePullRequestFile {
  filename: string;
  /** GitHub PR 파일 API의 `patch`. 변경이 너무 크면 GitHub가 주지 않는다 */
  patch?: string;
}

const findUnexpectedPackageLines = (patch: string | undefined): string[] => {
  if (patch === undefined) return [`${PACKAGE_FILE}: 바뀐 내용을 볼 수 없음`];
  return patch
    .split(/\r?\n/)
    .filter((line) => (line.startsWith("+") || line.startsWith("-")) && !VERSION_LINE.test(line))
    .map((line) => `${PACKAGE_FILE}: ${line}`);
};

/**
 * 릴리스 PR에서 버전 숫자(`package.json`의 `"version"`)·기록 파일 말고 바뀐 것을 찾는다.
 * 릴리스 PR은 CI 없이 관리자 권한으로 머지하므로, 다른 변경이 섞이면 그 목록을 돌려준다.
 *
 * @example findUnexpectedReleaseChanges(await fetchFiles(number)) // []
 */
export const findUnexpectedReleaseChanges = (files: readonly ReleasePullRequestFile[]): string[] =>
  files
    .flatMap(({ filename, patch }) => {
      if (filename === MANIFEST_FILE) return [];
      if (filename === PACKAGE_FILE) return findUnexpectedPackageLines(patch);
      return [filename];
    })
    .sort();

/** 사용자에게 보이는 변경의 커밋 제목: feat·fix·perf·revert, 또는 `!`를 붙인 호환이 깨지는 변경 */
const USER_FACING_SUBJECT = /^((feat|fix|perf|revert)(\([^)]*\))?!?|\w+(\([^)]*\))?!):/;

/**
 * 앞 태그 뒤 커밋 제목에 사용자에게 보이는 변경이 있는지 본다. 없으면(refactor·chore만) 릴리스 PR을 만들지 않는다.
 * release-please는 `changelog-type: github`일 때 노트를 GitHub 자동 목록으로 만들어 커밋 종류로 거르지 않으므로 여기서 가른다.
 *
 * @example hasUserFacingCommits(["chore: 정리", "feat: 새 기능"]) // true
 */
export const hasUserFacingCommits = (subjects: readonly string[]): boolean => subjects.some((subject) => USER_FACING_SUBJECT.test(subject));

const parseJson = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    // 읽지 못한 값은 아래에서 원래 글과 함께 알린다
    return undefined;
  }
};

/**
 * release-please 액션의 `pr` 출력(PR 정보 JSON)에서 PR 번호를 읽는다(#451).
 *
 * @example readReleasePullRequestNumber(process.env.RELEASE_PR ?? "") // 452
 */
export const readReleasePullRequestNumber = (json: string): number => {
  const value = parseJson(json);
  const number = typeof value === "object" && value !== null && "number" in value ? value.number : undefined;
  if (typeof number !== "number" || !Number.isInteger(number) || number <= 0) throw new Error(`릴리스 PR 정보를 읽지 못했습니다: ${json || "(빈 값)"}`);
  return number;
};

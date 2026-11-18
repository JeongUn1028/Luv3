import "server-only";
import { cacheLife } from "next/cache";
import { catchLoadError } from "@/lib/load";
import { APP_VERSION } from "./version";
import { parseReleases, type AppRelease } from "./releases";

/** 공개 리포라 토큰 없이 읽는다(주소마다 시간당 60번). 한 번에 받을 수 있는 최대(100개)를 받는다 */
export const RELEASES_URL = "https://api.github.com/repos/JeongUn1028/Luv3/releases?per_page=100";
/** 업데이트 기록은 없어도 되는 정보라 답이 늦으면 화면이 오래 기다리지 않게 짧게 끊는다 */
const RELEASES_TIMEOUT_MS = 3000;

export class ReleaseLoadError extends Error {
  readonly status: number | undefined;

  constructor(options?: ErrorOptions & { status?: number }) {
    super("업데이트 기록을 불러오지 못했어요.", options);
    this.name = "ReleaseLoadError";
    this.status = options?.status;
  }
}

/**
 * GitHub에서 릴리스 목록을 읽어 업데이트 기록으로 바꾼다.
 *
 * @throws {ReleaseLoadError} 연결이 끊겼거나, 답이 늦거나, 거절됐거나(요청 한도 초과 등), 응답 모양이 다를 때
 * @example const releases = await fetchReleases()
 */
export const fetchReleases = async (fetcher: typeof fetch = fetch): Promise<AppRelease[]> => {
  const response = await fetcher(RELEASES_URL, {
    headers: { accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28" },
    signal: AbortSignal.timeout(RELEASES_TIMEOUT_MS),
  }).catch((cause: unknown) => {
    throw new ReleaseLoadError({ cause });
  });
  if (!response.ok) throw new ReleaseLoadError({ status: response.status });
  const releases = parseReleases(
    await response.json().catch((cause: unknown) => {
      throw new ReleaseLoadError({ cause });
    }),
  );
  if (!releases) throw new ReleaseLoadError({ cause: new Error("릴리스 목록 모양이 다릅니다") });
  return releases;
};

/**
 * 업데이트 기록. 받지 못하면 화면은 그대로 두고 기록만 비우도록 `undefined`를 돌려주고 원인을 서버 로그에 남긴다.
 *
 * @example const releases = await loadReleases() // undefined면 받지 못함
 */
export const loadReleases = async (fetcher: typeof fetch = fetch): Promise<AppRelease[] | undefined> => {
  const result = await catchLoadError(() => fetchReleases(fetcher), ReleaseLoadError);
  if (!(result instanceof ReleaseLoadError)) return result;
  // catchLoadError가 원인을 남긴다. GitHub가 답한 상태 코드(요청 한도 초과면 403)를 덧붙인다
  console.error("업데이트 기록 조회 실패", { status: result.status });
  return undefined;
};

/**
 * 지금 버전의 Release가 있고 요약까지 붙었는지 본다.
 *
 * @example isCurrentReleaseReady(releases, "1.2.0")
 */
export const isCurrentReleaseReady = (releases: AppRelease[], currentVersion: string = APP_VERSION): boolean =>
  releases.some(({ version, notes }) => version === currentVersion && notes.length > 0);

/**
 * 앱 정보 화면이 쓰는 업데이트 기록. 화면을 열 때마다 GitHub를 부르지 않게 하루 동안 기억하고,
 * 받지 못했으면 몇 분만 기억해 곧 다시 묻는다. 오류를 던지면 화면 오류로 번지므로 `undefined`로 돌려받는다.
 * 버전을 올려 배포한 직후에는 아직 Release나 그 요약이 없으므로(README "버전과 릴리스" 3~4번), 지금 버전의 요약이 없으면 한 시간만 기억한다
 *
 * @example const releases = await getReleases()
 */
export const getReleases = async (): Promise<AppRelease[] | undefined> => {
  "use cache";
  const releases = await loadReleases();
  if (!releases) cacheLife("minutes");
  else if (isCurrentReleaseReady(releases)) cacheLife("days");
  else cacheLife("hours");
  return releases;
};

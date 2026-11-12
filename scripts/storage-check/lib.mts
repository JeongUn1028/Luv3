// GitHub Actions에서 의존성 설치 없이 Node로 바로 실행하므로 `@/` 별칭이나 외부 패키지를 불러오지 않는다
import { formatStorageUsage, NEAR_LIMIT_RATIO } from "../backup/lib.mts";

/** 정리 미리 보기 응답을 판단한 결과 */
export interface StorageCheckResult {
  /** 실행 기록에 남길 요약 */
  summary: string[];
  /** 하나라도 있으면 작업을 실패로 끝내 메일이 오게 한다 */
  problems: string[];
  /** 실패로 끝내지 않고 실행 기록에 경고만 남긴다 */
  warnings: string[];
}

interface EvaluateCleanupPreviewParams {
  httpStatus: number;
  /** `/api/photo-cleanup?preview=1`의 응답 본문 */
  body: string;
}

const SHOWN_BODY_LENGTH = 300;

// 공개 리포라 Actions 실행 기록은 누구나 본다. 파일 경로는 남기지 않고 개수만 남기며, 목록은 README의 미리 보기 명령으로 본다
const SEE_LIST_GUIDE = "목록은 README '주인 없는 사진 정리'의 미리 보기 명령으로 확인하세요.";

const NUMBER_FIELDS = [
  "fileCount",
  "totalBytes",
  "unsizedCount",
  "inUseCount",
  "recentOrphanCount",
  "staleOrphanCount",
  "trashFileCount",
  "trashBytes",
  "expiredTrashCount",
  "overdueTrashCount",
] as const;
const BYTES_PER_MEGABYTE = 1024 ** 2;
const PATH_LIST_FIELDS = ["orphanPaths", "unknownPaths"] as const;

/** 판단에 쓰는 미리 보기 응답 칸(`CleanupResult`, src/lib/photos/orphan-cleanup.ts) */
type CleanupPreview = Record<(typeof NUMBER_FIELDS)[number], number> &
  Record<(typeof PATH_LIST_FIELDS)[number], string[]> & { reason?: string };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === "string");

const parseJson = (body: string): unknown => {
  try {
    return JSON.parse(body);
  } catch {
    return undefined;
  }
};

const findMissingFields = (preview: Record<string, unknown>): string[] => [
  ...NUMBER_FIELDS.filter((field) => typeof preview[field] !== "number"),
  ...PATH_LIST_FIELDS.filter((field) => !isStringArray(preview[field])),
];

const isCleanupPreview = (preview: Record<string, unknown>): preview is CleanupPreview =>
  findMissingFields(preview).length === 0 && (preview.reason === undefined || typeof preview.reason === "string");

const findStatusHint = (httpStatus: number, errorCode: unknown): string | undefined => {
  switch (httpStatus) {
    case 401:
      return "저장소 비밀 값 CRON_SECRET이 Vercel 값과 다릅니다";
    case 404:
      return "운영 주소(CLEANUP_PREVIEW_URL)와 배포를 확인하세요";
    case 500:
      return errorCode === "CLEANUP_NOT_CONFIGURED"
        ? "Vercel 환경 변수 SUPABASE_SECRET_KEY가 없습니다"
        : "함수가 실패했습니다. Vercel 로그를 확인하세요";
    case 502:
      return "파일 목록이나 DB를 읽지 못했습니다. Supabase 프로젝트가 일시정지됐는지 확인하세요";
    case 504:
      return "함수가 시간 안에 끝나지 않았습니다. 버킷 파일이 많아 목록 읽기가 느려졌는지 Vercel 로그를 확인하세요";
    default:
      return undefined;
  }
};

// 실패 응답의 본문을 실행 기록에 옮긴다. 정리 결과(409 등)에는 파일 경로가 들어 있어 옮기지 않는다
const describeErrorBody = (body: string, parsed: unknown): string => {
  if (parsed === undefined) return body.slice(0, SHOWN_BODY_LENGTH);
  if (isRecord(parsed) && typeof parsed.code === "string") return `${parsed.code} ${String(parsed.message)}`;
  return "(정리 결과라 경로가 담겨 옮기지 않습니다)";
};

const checkStorageUsage = (preview: CleanupPreview, result: StorageCheckResult): void => {
  const usage = formatStorageUsage(preview.fileCount, preview.totalBytes);
  result.summary.push(usage.message);
  if (usage.isNearLimit) {
    result.problems.push(
      `저장 용량이 무료 한도의 ${NEAR_LIMIT_RATIO * 100}%를 넘었습니다: ${usage.message}. 지울 기록이 있는지 보거나 플랜을 검토하세요.`,
    );
  }
  if (preview.unsizedCount > 0) {
    result.warnings.push(
      `Storage가 크기를 주지 않은 파일 ${preview.unsizedCount}개는 합계에서 빠졌습니다. 실제 사용량은 대시보드에서 확인하세요.`,
    );
  }
};

const checkCleanupState = (preview: CleanupPreview, result: StorageCheckResult): void => {
  if (preview.reason !== undefined) {
    result.problems.push(`사진 정리 작업이 지우지 않고 멈추는 상태입니다: ${preview.reason}`);
  }
  // 지난 1일 정리 뒤에 생긴 지울 파일은 다음 정리가 치운다. 그래서 점검을 아무 날 돌려도 정상 상태를 실패로 보지 않는다
  if (preview.staleOrphanCount > 0) {
    result.problems.push(
      `지난 1일 정리가 지웠어야 할 파일 ${preview.staleOrphanCount}개가 남아 있습니다. 정리가 실패했거나 Vercel 환경 변수 ` +
        `PHOTO_CLEANUP_DELETE가 꺼져 있을 수 있습니다. Vercel의 Cron Jobs 실행 기록을 확인하세요. ${SEE_LIST_GUIDE}`,
    );
  }
  if (preview.unknownPaths.length > 0) {
    result.warnings.push(
      `앱이 만드는 이름이 아닌 파일 ${preview.unknownPaths.length}개가 있습니다. 정리 작업은 건드리지 않습니다. ${SEE_LIST_GUIDE}`,
    );
  }
  result.summary.push(
    `쓰는 파일 ${preview.inUseCount}개, 지울 파일 ${preview.orphanPaths.length}개(지난 정리가 지웠어야 할 것 ${preview.staleOrphanCount}개), ` +
      `올린 지 하루가 안 된 주인 없는 파일 ${preview.recentOrphanCount}개`,
  );
};

// 휴지통(#311) 크기는 전체 사용량에 이미 들어 있다. 보관 기간이 지난 사진은 1일 정리가 지운다
const checkTrash = (preview: CleanupPreview, result: StorageCheckResult): void => {
  result.summary.push(
    `휴지통 파일 ${preview.trashFileCount}개, ${(preview.trashBytes / BYTES_PER_MEGABYTE).toFixed(1)} MB ` +
      `(보관 기간이 지나 이번 정리에서 지울 사진 ${preview.expiredTrashCount}장)`,
  );
  if (preview.overdueTrashCount > 0) {
    result.problems.push(
      `지난 1일 정리가 지웠어야 할 휴지통 사진 ${preview.overdueTrashCount}장이 남아 있습니다. 정리가 실패했거나 ` +
        "Vercel 환경 변수 PHOTO_CLEANUP_DELETE가 꺼져 있을 수 있습니다. Vercel의 Cron Jobs 실행 기록을 확인하세요.",
    );
  }
};

/**
 * 사진 정리 미리 보기 응답으로 저장 공간과 정리 작업 상태를 판단한다(#310). 저장 용량이 무료 한도의 80%를 넘거나,
 * 정리 작업이 멈추는 상태(`reason`)이거나, 지난 1일 정리가 지웠어야 할 파일이나 휴지통 사진이 남아 있거나,
 * 응답이 실패·이상하면 `problems`에 담는다.
 *
 * @example
 * const result = evaluateCleanupPreview({ httpStatus: 200, body: '{"status":"preview",...}' });
 * if (result.problems.length > 0) process.exitCode = 1;
 */
export const evaluateCleanupPreview = ({ httpStatus, body }: EvaluateCleanupPreviewParams): StorageCheckResult => {
  const result: StorageCheckResult = { summary: [], problems: [], warnings: [] };
  const parsed = parseJson(body);

  if (httpStatus !== 200) {
    const hint = findStatusHint(httpStatus, isRecord(parsed) ? parsed.code : undefined);
    result.problems.push(
      `사진 정리 미리 보기가 실패했습니다(HTTP ${httpStatus}${hint ? `: ${hint}` : ""}). 응답: ${describeErrorBody(body, parsed)}`,
    );
    return result;
  }

  if (!isRecord(parsed)) {
    result.problems.push(`응답이 JSON 객체가 아닙니다: ${body.slice(0, SHOWN_BODY_LENGTH)}`);
    return result;
  }
  // 주소에 preview가 빠지면 정리가 실제로 지운 결과가 온다. 이 작업은 지우지 않아야 한다
  if (parsed.status !== "preview") {
    result.problems.push(`미리 보기 응답이 아닙니다(status: ${String(parsed.status)}). 주소에 ?preview=1이 있는지 확인하세요.`);
    return result;
  }
  if (!isCleanupPreview(parsed)) {
    const missing = findMissingFields(parsed);
    result.problems.push(
      `응답에 판단할 칸이 없거나 형식이 다릅니다(${missing.length > 0 ? missing.join(", ") : "reason"}). 운영 배포가 #310보다 앞선 것인지 확인하세요.`,
    );
    return result;
  }

  checkStorageUsage(parsed, result);
  checkCleanupState(parsed, result);
  checkTrash(parsed, result);
  return result;
};

/**
 * 문구를 GitHub Actions 명령 줄(`::error::…`)로 바꾼다. 줄바꿈과 `%`는 명령 형식에 맞게 이스케이프한다.
 *
 * @example toWorkflowCommand("warning", "1GB의 80%") // "::warning::1GB의 80%25"
 */
export const toWorkflowCommand = (level: "error" | "warning", message: string): string =>
  `::${level}::${message.replaceAll("%", "%25").replaceAll("\r", "%0D").replaceAll("\n", "%0A")}`;

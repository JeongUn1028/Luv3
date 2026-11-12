// 사진 정리 Cron 예약(vercel.json의 `0 4 1 * *`: 매달 1일 UTC 4시대). 바꾸면 테스트가 알려 준다
const CLEANUP_DAY_OF_MONTH = 1;
const CLEANUP_HOUR_UTC = 4;

/**
 * `now`보다 앞선 가장 최근 정리 예약 시각(매달 1일 UTC 4시)을 돌려준다. 저장 공간 월간 점검(#310)이 아무 날 돌아도
 * "지난 정리가 지웠어야 할 파일"만 문제로 보게 하는 기준이다.
 *
 * @example getLastCleanupStart(new Date("2026-11-10T12:00:00Z")) // 2026-11-01T04:00:00Z
 */
export const getLastCleanupStart = (now: Date): Date => {
  const thisMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), CLEANUP_DAY_OF_MONTH, CLEANUP_HOUR_UTC));
  if (thisMonth.getTime() <= now.getTime()) return thisMonth;
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, CLEANUP_DAY_OF_MONTH, CLEANUP_HOUR_UTC));
};

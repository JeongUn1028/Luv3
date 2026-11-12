/** 지운 사진을 휴지통에 두는 기간(#311, 2026-11-12 사용자 결정). 지난 것은 그다음 매달 1일 정리 때 지운다 */
export const TRASH_RETENTION_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

interface TrashAgeParams {
  /** 휴지통 행의 `deleted_at`(ISO 문자열) */
  deletedAt: string;
  now: Date;
}

/**
 * 휴지통 사진의 보관 기간이 지났는지 돌려준다. 지운 시각을 읽을 수 없으면 지우지 않도록 false다.
 *
 * @example isTrashExpired({ deletedAt: "2026-10-01T00:00:00Z", now: new Date("2026-11-10T00:00:00Z") }) // true
 */
export const isTrashExpired = ({ deletedAt, now }: TrashAgeParams): boolean => {
  const deletedTime = Date.parse(deletedAt);
  return !Number.isNaN(deletedTime) && now.getTime() - deletedTime >= TRASH_RETENTION_DAYS * DAY_MS;
};

/**
 * 보관 기간 중 남은 날(휴지통 화면). 하루가 덜 남아도 하루로 세어, `isTrashExpired`가 false인 사진은 1일 이상이고 true인 사진만 0이다.
 * 지운 시각을 읽을 수 없으면 `isTrashExpired`처럼 지우지 않는 쪽으로 보아 30일이다.
 *
 * @example countTrashDaysLeft({ deletedAt: "2026-11-11T05:00:00Z", now: new Date("2026-11-12T06:00:00Z") }) // 29
 */
export const countTrashDaysLeft = ({ deletedAt, now }: TrashAgeParams): number => {
  const deletedTime = Date.parse(deletedAt);
  if (Number.isNaN(deletedTime)) return TRASH_RETENTION_DAYS;
  return Math.max(0, Math.ceil((deletedTime + TRASH_RETENTION_DAYS * DAY_MS - now.getTime()) / DAY_MS));
};

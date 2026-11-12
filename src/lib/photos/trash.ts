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

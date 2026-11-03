import { timingSafeEqual } from "node:crypto";

/** 이보다 짧은 비밀 값은 설정 실수로 보고 받지 않는다 */
const MIN_SECRET_LENGTH = 32;

/**
 * Vercel Cron 요청인지 확인한다. Vercel은 환경 변수 `CRON_SECRET`이 있으면 `Authorization: Bearer <값>`을 붙여 보낸다.
 * 서버에 비밀 값이 없으면(설정 전) 아무 요청도 허락하지 않는다. 비교는 글자마다 걸리는 시간이 같게 한다.
 *
 * @example isAuthorizedCronRequest(request.headers.get("authorization"), process.env.CRON_SECRET)
 */
export const isAuthorizedCronRequest = (authorization: string | null, secret: string | undefined): boolean => {
  if (!secret || secret.length < MIN_SECRET_LENGTH || !authorization) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(authorization);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
};

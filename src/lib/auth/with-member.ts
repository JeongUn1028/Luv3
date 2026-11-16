import "server-only";
import { getCurrentMember, type Member } from "@/lib/auth/member";

/**
 * 허용목록 확인(members 조회)과 화면 조회를 함께 시작해, 확인이 끝나기를 기다린 뒤 조회하는 왕복 한 번을 줄인다(#344).
 * 회원이 아니면 RLS가 빈 결과를 주고, 조회 결과나 조회 에러보다 회원 확인의 이동(`redirect`)을 먼저 던진다.
 * `member.id`가 필요한 변환은 돌려받은 뒤에 한다. 쿠키를 읽으므로 cacheComponents에서는 `<Suspense>` 안에서 부른다.
 *
 * @throws 회원 확인의 이동(로그인 화면, 허용목록 밖 로그아웃), 그다음 `load`의 에러
 * @example const [, todos] = await withCurrentMember(() => catchLoadError(getTodos, TodoLoadError))
 */
export const withCurrentMember = async <T>(load: () => Promise<T>): Promise<[Member, T]> => {
  // load가 곧바로 던져도 회원 확인 결과를 먼저 보도록 거부된 약속으로 바꾼다
  const [member, loaded] = await Promise.allSettled([getCurrentMember(), new Promise<T>((resolve) => resolve(load()))]);
  if (member.status === "rejected") throw member.reason;
  if (loaded.status === "rejected") throw loaded.reason;
  return [member.value, loaded.value];
};

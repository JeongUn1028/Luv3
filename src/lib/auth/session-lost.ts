import { isAuthApiError, isAuthSessionMissingError } from "@supabase/supabase-js";

/** 저장·조회 요청이 로그인 문제로 거절됐을 때 `window`에 알리는 이벤트 */
export const SESSION_LOST_EVENT = "luv3:session-lost";

const REST_PATH_PREFIX = "/rest/v1/";
const STORAGE_PATH_PREFIX = "/storage/v1/";

/**
 * 세션이 끊겼을 수 있는 응답인지 본다. DB는 401을 돌려주고, 사진 저장소는 HTTP 400에 본문으로만 원인을 적어 4xx를 넓게 본다.
 * 정말 끊겼는지는 `auth.getUser()`로 다시 확인하므로 넓게 봐도 창이 잘못 뜨지 않는다.
 * 로그인 요청의 실패(틀린 비밀번호 등)는 해당하지 않는다.
 *
 * @example isUnauthorizedResponse("https://x.supabase.co/rest/v1/todos", new Response(null, { status: 401 })) // true
 */
export const isUnauthorizedResponse = (url: string, response: Response): boolean => {
  const { pathname } = new URL(url);
  if (pathname.startsWith(REST_PATH_PREFIX)) return response.status === 401;
  return pathname.startsWith(STORAGE_PATH_PREFIX) && response.status >= 400 && response.status < 500;
};

/**
 * 응답이 로그인 문제로 거절되면 알려 주는 fetch를 만든다. 응답은 그대로 돌려줘 부르는 쪽의 오류 처리는 바뀌지 않는다.
 *
 * @example createSessionAwareFetch(fetch, () => window.dispatchEvent(new Event(SESSION_LOST_EVENT)))
 */
export const createSessionAwareFetch =
  (baseFetch: typeof fetch, onUnauthorized: () => void): typeof fetch =>
  async (input, init) => {
    const response = await baseFetch(input, init);
    const url = input instanceof Request ? input.url : String(input);
    if (isUnauthorizedResponse(url, response)) onUnauthorized();
    return response;
  };

/**
 * `auth.getUser()`의 오류가 세션이 정말 사라졌다는 뜻인지 본다. 토큰 거절은 401·403 외에 400(갱신 토큰이 없음·이미 씀)으로도 온다.
 * 인터넷·서버 문제와 요청 제한(429)은 다시 로그인해도 풀리지 않으므로 아니라고 답한다.
 *
 * @example isSessionLostError(new AuthSessionMissingError()) // true
 */
export const isSessionLostError = (error: unknown): boolean =>
  isAuthSessionMissingError(error) || (isAuthApiError(error) && error.status >= 400 && error.status < 500 && error.status !== 429);

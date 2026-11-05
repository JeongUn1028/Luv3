export const LOGIN_PATH = "/login";
export const HOME_PATH = "/";
export const SIGN_OUT_PATH = "/auth/signout";

/** 무료 플랜 일시정지를 막으려고 Vercel Cron이 부르는 경로. 로그인 대신 CRON_SECRET으로 확인한다 */
export const KEEPALIVE_PATH = "/api/keepalive";

/** 로그인하지 않아도 열 수 있는 경로(하위 경로 포함). 로그인 화면과 로그아웃 처리만 둔다. */
const PUBLIC_PATH_PREFIXES = [LOGIN_PATH, "/auth"] as const;

/** 하위 경로 없이 이 주소만 비로그인으로 열 수 있다. 나중에 아래에 붙는 경로가 실수로 공개되지 않게 한다. */
const PUBLIC_EXACT_PATHS: readonly string[] = [KEEPALIVE_PATH];

/**
 * 비로그인 상태로 접근해도 되는 경로인지 판단한다. `/login`과 `/login/...`은 허용하고 `/loginx`는 막는다.
 * `/api/keepalive`는 그 주소만 허용한다.
 *
 * @example isPublicPath("/auth/signout") // true
 */
export const isPublicPath = (pathname: string): boolean =>
  PUBLIC_EXACT_PATHS.includes(pathname) ||
  PUBLIC_PATH_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));

const PARSE_BASE = "http://localhost";

/**
 * 로그인 후 돌아갈 경로를 같은 사이트 안의 경로로만 제한한다(오픈 리다이렉트 방지).
 * 외부 주소, 프로토콜 상대 주소(`//evil.com`), 로그인·인증 경로는 홈으로 바꾼다.
 * URL 파서가 탭·줄바꿈을 지운 결과로 판단해야 `/	/evil.com` 같은 우회를 막을 수 있다.
 *
 * @example getSafeNextPath("https://evil.com") // "/"
 */
export const getSafeNextPath = (next: string | null | undefined): string => {
  if (!next || !next.startsWith("/")) return HOME_PATH;

  const parsed = new URL(next, PARSE_BASE);
  if (parsed.origin !== PARSE_BASE || isPublicPath(parsed.pathname)) return HOME_PATH;

  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
};

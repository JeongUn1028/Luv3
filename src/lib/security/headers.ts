// next.config.ts가 불러오므로 `@/` 별칭과 서버 전용 모듈을 쓰지 않는다
import { SDK_URL } from "../map/kakao-sdk";

/** 응답 헤더 하나. next.config의 `headers()`가 받는 모양이다 */
export interface SecurityHeader {
  key: string;
  value: string;
}

export interface BuildSecurityHeadersParams {
  /** 브라우저가 부르는 Supabase 주소(`NEXT_PUBLIC_SUPABASE_URL`). Vercel 미리 보기에는 없다(resolveHeaderSupabaseUrl) */
  supabaseUrl: string | undefined;
  /** `next dev`인지. 개발 서버에는 HSTS를 보내지 않는다 */
  isDev: boolean;
}

/** 카카오 지도 SDK 주소와, SDK가 다시 불러오는 지도 본체 주소(2026-11 실제 키로 확인) */
const KAKAO_MAP_SCRIPT_ORIGINS = [new URL(SDK_URL).origin, "https://t1.kakaocdn.net"];
/** 지도 그림(mts 등)과 표시 이미지가 오는 곳. 2026-11 실제 키로 확인한 주소는 t1·mts.kakaocdn.net */
const KAKAO_MAP_IMAGE_ORIGIN = "https://*.kakaocdn.net";

/**
 * 콘텐츠 보안 정책(CSP)을 만든다. 다른 사이트의 스크립트·데이터 전송·다른 사이트 안에 넣기를 막는다.
 * 미리 그려 둔 화면(cacheComponents)을 지키려고 요청마다 바뀌는 nonce 대신 인라인 스크립트를 허용한다(#170 사용자 결정).
 * eval도 허용한다: 아이폰 사진(HEIC)을 바꾸는 heic2any가 blob: 주소로 Worker를 만들고, Worker는 페이지의 CSP를 물려받은 채
 * new Function을 쓴다. 개발 중 React도 eval을 쓴다. 인라인을 이미 허용해 eval을 막아 얻는 보호는 작다.
 *
 * @example buildContentSecurityPolicy({ supabaseUrl: "https://abc.supabase.co", isDev: false }) // "default-src 'self'; ..."
 */
export const buildContentSecurityPolicy = ({ supabaseUrl }: BuildSecurityHeadersParams): string => {
  const supabase = supabaseUrl === undefined ? undefined : new URL(supabaseUrl);
  const supabaseSource = supabase ? [supabase.origin] : [];
  const directives = [
    "default-src 'self'",
    ["script-src 'self' 'unsafe-inline' 'unsafe-eval'", ...KAKAO_MAP_SCRIPT_ORIGINS].join(" "),
    "worker-src 'self' blob:",
    "style-src 'self' 'unsafe-inline'",
    ["img-src 'self' data: blob:", ...supabaseSource, KAKAO_MAP_IMAGE_ORIGIN].join(" "),
    "font-src 'self'",
    ["connect-src 'self'", ...supabaseSource].join(" "),
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    // 로컬 Supabase(http)까지 https로 바꾸면 요청이 끊긴다
    ...(supabase?.protocol === "https:" ? ["upgrade-insecure-requests"] : []),
  ];
  return directives.join("; ");
};

interface ResolveHeaderSupabaseUrlParams {
  supabaseUrl: string | undefined;
  /** Vercel이 넣는 배포 종류(`VERCEL_ENV`): production, preview, development. Vercel 밖이면 없다 */
  vercelEnv: string | undefined;
}

/**
 * CSP에 넣을 Supabase 주소를 정한다. 없으면 브라우저가 Supabase를 부르지 못하므로 빌드를 멈춘다.
 * Vercel 미리 보기만 예외로 주소 없이 넘긴다: PR 코드가 운영 데이터에 닿지 않게 Supabase 값을 두지 않아,
 * 예전처럼 빌드만 통과하고 로그인은 되지 않는 화면이다(#170 사용자 결정).
 *
 * @example resolveHeaderSupabaseUrl({ supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL, vercelEnv: process.env.VERCEL_ENV })
 */
export const resolveHeaderSupabaseUrl = ({ supabaseUrl, vercelEnv }: ResolveHeaderSupabaseUrlParams): string | undefined => {
  if (supabaseUrl) return supabaseUrl;
  if (vercelEnv === "preview") return undefined;
  throw new Error("환경 변수가 없습니다: NEXT_PUBLIC_SUPABASE_URL (.env.example 참고)");
};

/**
 * 모든 응답에 붙일 보안 헤더를 만든다.
 *
 * @example headers: async () => [{ source: "/(.*)", headers: buildSecurityHeaders({ supabaseUrl, isDev }) }]
 */
export const buildSecurityHeaders = (params: BuildSecurityHeadersParams): SecurityHeader[] => [
  { key: "Content-Security-Policy", value: buildContentSecurityPolicy(params) },
  { key: "X-Content-Type-Options", value: "nosniff" },
  // frame-ancestors를 모르는 오래된 브라우저용
  { key: "X-Frame-Options", value: "DENY" },
  // 카카오 지도 키는 요청한 사이트 주소로 허용 도메인을 확인하므로 다른 사이트에도 출처는 보낸다
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // 하위 도메인은 앱이 정하지 않으므로 includeSubDomains는 넣지 않는다.
  // https로 띄운 개발 서버(localhost)에서 받으면 같은 주소의 다른 http 프로젝트가 2년 동안 막히므로 운영에서만 보낸다
  ...(params.isDev ? [] : [{ key: "Strict-Transport-Security", value: "max-age=63072000" }]),
];

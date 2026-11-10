// next.config.ts가 불러오므로 `@/` 별칭과 서버 전용 모듈을 쓰지 않는다

/** 응답 헤더 하나. next.config의 `headers()`가 받는 모양이다 */
export interface SecurityHeader {
  key: string;
  value: string;
}

export interface BuildSecurityHeadersParams {
  /** 브라우저가 부르는 Supabase 주소(`NEXT_PUBLIC_SUPABASE_URL`) */
  supabaseUrl: string;
  /** `next dev`인지. 개발 중에는 React가 eval을 쓴다 */
  isDev: boolean;
}

/** 카카오 지도 SDK 주소와, SDK가 다시 불러오는 지도 본체 주소(src/lib/map/kakao-sdk.ts) */
const KAKAO_MAP_SCRIPT_ORIGINS = ["https://dapi.kakao.com", "https://t1.kakaocdn.net"];
/** 지도 그림(mts 등)과 표시 이미지가 오는 곳. 2026-11 실제 키로 확인한 주소는 t1·mts.kakaocdn.net */
const KAKAO_MAP_IMAGE_ORIGIN = "https://*.kakaocdn.net";

/**
 * 콘텐츠 보안 정책(CSP)을 만든다. 다른 사이트의 스크립트·데이터 전송·다른 사이트 안에 넣기를 막는다.
 * 미리 그려 둔 화면(cacheComponents)을 지키려고 요청마다 바뀌는 nonce 대신 인라인 스크립트를 허용한다(#170 사용자 결정).
 *
 * @example buildContentSecurityPolicy({ supabaseUrl: "https://abc.supabase.co", isDev: false }) // "default-src 'self'; ..."
 */
export const buildContentSecurityPolicy = ({ supabaseUrl, isDev }: BuildSecurityHeadersParams): string => {
  const supabase = new URL(supabaseUrl);
  const directives = [
    "default-src 'self'",
    ["script-src 'self' 'unsafe-inline'", ...(isDev ? ["'unsafe-eval'"] : []), ...KAKAO_MAP_SCRIPT_ORIGINS].join(" "),
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: ${supabase.origin} ${KAKAO_MAP_IMAGE_ORIGIN}`,
    "font-src 'self'",
    `connect-src 'self' ${supabase.origin}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    // 로컬 Supabase(http)까지 https로 바꾸면 요청이 끊긴다
    ...(supabase.protocol === "https:" ? ["upgrade-insecure-requests"] : []),
  ];
  return directives.join("; ");
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
  // 하위 도메인은 앱이 정하지 않으므로 includeSubDomains는 넣지 않는다
  { key: "Strict-Transport-Security", value: "max-age=63072000" },
];

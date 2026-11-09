import type { JWK, SupabaseClient } from "@supabase/supabase-js";

export interface Jwks {
  keys: JWK[];
}

/**
 * 운영 Supabase가 접속 토큰을 서명하는 공개 키(JWKS, ES256). 비밀 값이 아니다.
 * 누구나 `<프로젝트 주소>/auth/v1/.well-known/jwks.json`에서 받을 수 있다.
 * 서명 키를 바꾸거나 폐기할 때는 README의 "로그인 공개 키" 절차대로 함께 고친다(#202).
 */
export const SUPABASE_JWKS: Jwks = {
  keys: [
    {
      alg: "ES256",
      crv: "P-256",
      ext: true,
      key_ops: ["verify"],
      kid: "e175c702-9ac6-40bb-8c93-dcd09d01f353",
      kty: "EC",
      use: "sig",
      x: "75oXpKsbigTwzAz0B-YORHrngZATNYfk30faHZtFd34",
      y: "iiJlbtrBiFe-cSkdPuntSUylQ-YdUYWzugcOTv698kI",
    },
  ],
};

type ClaimsReader = Pick<SupabaseClient["auth"], "getClaims">;

/**
 * 세션의 접속 토큰을 확인해 로그인 정보(claims)를 읽는다. 넣어 둔 공개 키로 먼저 확인한다.
 * 그러면 서버가 새로 뜬 뒤나 라이브러리가 저장해 둔 공개 키가 10분 지난 뒤에도 Supabase에 공개 키를 다시 받으러 가지 않는다.
 * 토큰의 kid에 맞는 키가 없으면(로컬 Supabase, 서명 키를 바꾼 뒤) 라이브러리가 원래대로 Supabase에서 받아 확인한다.
 *
 * @example const { data } = await getSessionClaims(supabase.auth)
 */
export const getSessionClaims = (auth: ClaimsReader, jwks: Jwks = SUPABASE_JWKS): ReturnType<ClaimsReader["getClaims"]> =>
  auth.getClaims(undefined, { jwks });

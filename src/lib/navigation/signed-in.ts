import { getSessionClaims } from "@/lib/supabase/jwks";

type ClaimsReader = Parameters<typeof getSessionClaims>[0];

/**
 * 사용자가 누르지 않은 새로 고침 전에 지금 기기의 로그인이 살아 있는지 본다(#102).
 * 서버(proxy·`getCurrentMember`)와 같은 방식으로 넣어 둔 공개 키로 토큰을 기기에서 확인해, 인증 서버에 묻는 왕복을 줄인다(#344).
 * 토큰이 만료됐으면 라이브러리가 갱신을 시도하고, 갱신하지 못하면 거짓이다.
 * 인터넷이 끊겼으면 새로 받아도 실패하므로 확인하지 않고 거짓을 돌려준다(예전 `getUser`가 실패로 걸러 주던 경우).
 *
 * @example if (!(await isSignedInHere(createClient().auth))) return
 */
export const isSignedInHere = async (auth: ClaimsReader): Promise<boolean> => {
  if (!navigator.onLine) return false;
  const { data } = await getSessionClaims(auth);
  return Boolean(data?.claims.sub);
};

import { getSessionClaims } from "@/lib/supabase/jwks";
import { loadClient } from "@/lib/supabase/load-client";

type ClaimsReader = Parameters<typeof getSessionClaims>[0];

/**
 * 사용자가 누르지 않은 새로 고침 전에 지금 기기의 로그인이 살아 있는지 본다(#102).
 * 서버(proxy·`getCurrentMember`)와 같은 방식으로 넣어 둔 공개 키로 토큰을 기기에서 확인해, 인증 서버에 묻는 왕복을 줄인다(#344).
 * 토큰이 만료됐으면 라이브러리가 갱신을 시도하고, 갱신하지 못하면 거짓이다.
 * 인터넷이 끊겼으면 새로 받아도 실패하므로 확인하지 않고 거짓을 돌려준다(예전 `getUser`가 실패로 걸러 주던 경우).
 *
 * @example if (!(await isSignedInHere((await loadClient()).auth))) return
 */
export const isSignedInHere = async (auth: ClaimsReader): Promise<boolean> => {
  if (!navigator.onLine) return false;
  const { data } = await getSessionClaims(auth);
  return Boolean(data?.claims.sub);
};

/**
 * 브라우저용 클라이언트를 불러와 `isSignedInHere`로 본다(#457). 라이브러리 파일을 받지 못하면(끊김, 배포로 예전 파일이 사라짐)
 * 확인할 수 없으므로 기록하고 거짓을 돌려준다. 부르는 쪽은 새로 받기를 건너뛰고 다음 기회에 다시 본다.
 *
 * @example if (!(await isSignedInNow())) return
 */
export const isSignedInNow = async (): Promise<boolean> => {
  // 끊겼으면 어차피 거짓이라 라이브러리를 받으러 가지 않는다
  if (!navigator.onLine) return false;
  const supabase = await loadClient().catch((error: unknown) => {
    console.error(new Error("로그인을 확인할 라이브러리를 불러오지 못했습니다.", { cause: error }));
    return undefined;
  });
  return supabase ? isSignedInHere(supabase.auth) : false;
};

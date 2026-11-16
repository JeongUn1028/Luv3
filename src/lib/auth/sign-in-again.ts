import { getSignInErrorMessage, NOT_MEMBER_MESSAGE, SIGN_IN_UNAVAILABLE_MESSAGE } from "./login-messages";

/** 다시 로그인에 쓰는 인증 요청. Supabase의 `createClient().auth`가 이 모양이다 */
export interface SignInAuth {
  signInWithPassword: (credentials: { email: string; password: string }) => PromiseLike<{
    data: { user: { id: string } | null };
    error: { status?: number; code?: string } | null;
  }>;
  signOut: (options: { scope: "local" }) => PromiseLike<unknown>;
}

/** 회원인지 읽을 수 있는 표. Supabase의 `createClient().from("members")`가 이 모양이다 */
export interface MemberLookupTable {
  select: (columns: "id") => { eq: (column: "id", value: string) => { maybeSingle: () => PromiseLike<{ data: { id: string } | null; error: unknown }> } };
}

interface SignInAgainParams {
  email: string;
  password: string;
  auth: SignInAuth;
  members: MemberLookupTable;
}

/**
 * 세션이 끊긴 자리에서 다시 로그인한다(#102). 이 창은 화면을 옮기지 않아 서버의 허용목록 확인(getCurrentMember)을 거치지 않으므로,
 * 로그인한 뒤 회원인지 여기서 확인하고 아니면 이 기기에서만 로그아웃한다.
 *
 * @returns 실패하면 화면에 보여 줄 문구, 성공하면 undefined
 * @example const message = await signInAgain({ email, password, auth: supabase.auth, members: supabase.from("members") })
 */
export const signInAgain = async ({ email, password, auth, members }: SignInAgainParams): Promise<string | undefined> => {
  const { data, error } = await auth.signInWithPassword({ email: email.trim(), password });
  if (error || !data.user) return getSignInErrorMessage(error ?? {});

  const { data: member, error: memberError } = await members.select("id").eq("id", data.user.id).maybeSingle();
  if (member) return undefined;
  await auth.signOut({ scope: "local" });
  return memberError ? SIGN_IN_UNAVAILABLE_MESSAGE : NOT_MEMBER_MESSAGE;
};

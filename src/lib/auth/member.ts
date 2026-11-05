import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { LOGIN_PATH, SIGN_OUT_PATH } from "@/lib/auth/paths";

export interface Member {
  id: string;
  nickname: string;
}

/** 허용목록 밖 계정을 로그아웃시키는 경로 */
export const NOT_MEMBER_SIGNOUT_PATH = `${SIGN_OUT_PATH}?reason=not_member`;

/**
 * 현재 로그인한 사용자를 허용목록(members)에서 찾는다.
 * 로그인하지 않았으면 로그인 화면으로, 허용목록에 없으면 로그아웃 처리 경로로 보낸다.
 * 쿠키를 읽으므로 cacheComponents에서는 반드시 <Suspense> 안의 컴포넌트에서 호출한다.
 * 홈처럼 여러 칸이 저마다 불러도 한 요청 안에서는 한 번만 조회한다(React `cache`).
 *
 * @example const { nickname } = await getCurrentMember()
 */
export const getCurrentMember = cache(async (): Promise<Member> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims.sub;
  if (!userId) redirect(LOGIN_PATH);

  // RLS 때문에 허용목록 밖 사용자는 자기 행도 조회되지 않는다
  const { data: member, error } = await supabase
    .from("members")
    .select("id, nickname")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw new Error(`허용목록을 확인하지 못했습니다: ${error.message}`);
  if (!member) redirect(NOT_MEMBER_SIGNOUT_PATH);

  return member;
});

/**
 * 현재 세션의 로그인 이메일을 읽는다. 허용목록의 이메일은 손으로 넣어 다를 수 있어, 비밀번호 확인에는 세션의 값을 쓴다.
 * 쿠키를 읽으므로 cacheComponents에서는 반드시 <Suspense> 안의 컴포넌트에서 호출한다.
 *
 * @example const email = await getCurrentEmail()
 */
export const getCurrentEmail = async (): Promise<string> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const email = data?.claims.email;
  if (!email) throw new Error("세션에서 로그인 이메일을 찾지 못했습니다");
  return email;
};

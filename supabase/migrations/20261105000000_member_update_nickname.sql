-- 설정에서 각자 자기 닉네임을 바꾼다(#133).
-- members는 로그인 허용목록이라 이메일과 다른 사람 행은 지금처럼 대시보드에서만 바꾼다.

-- 정책만 더하면 기본 권한 때문에 자기 행의 이메일까지 바뀌므로 칸 단위로 좁힌다
revoke update on table public.members from authenticated;
grant update (nickname) on table public.members to authenticated;

-- 글자 수 제한(1~6자)은 화면에 보이는 글자 단위라 DB에서 셀 수 없어 폼이 맡는다.
-- 예전 닉네임이 그대로 남도록 char_length 1~20 제약은 그대로 둔다.
-- 앞뒤 공백 검사는 값 제약이 아니라 정책에 둬서, 대시보드와 백업 복구는 예전 값을 그대로 다룰 수 있게 한다.
create policy "members_update_own_nickname" on public.members
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()) and nickname !~ '^\s|\s$');

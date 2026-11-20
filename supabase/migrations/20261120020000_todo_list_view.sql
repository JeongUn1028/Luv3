-- 하고 싶은 것 '목록 보기' 설정(#497 PR ②). 사람마다 하나라 어느 기기에서 열어도 같고, 상대 화면에는 영향이 없다.
-- 'sections'(구역으로, 기본값): 한 목록에 '일정 잡힌 것 → 아직 → 완료' 구역
-- 'tabs'(탭으로): 위에 탭 3개 '일정 잡힌 것 / 아직 / 완료'
-- 하고 싶은 것 화면은 이미 회원 확인(members 읽기)을 하므로 같은 행에 두어 조회가 늘지 않게 한다(사용자 결정 A안).
-- 바꾸기는 set_todo_list_view로만 한다. 앱이 바꿀 수 있는 칸은 닉네임뿐인 그대로 둔다(20261105000000).

alter table public.members
  add column todo_list_view text not null default 'sections'
    constraint members_todo_list_view_check check (todo_list_view in ('sections', 'tabs'));

-- 로그인한 사람의 목록 보기를 바꾼다
create function public.set_todo_list_view(p_view text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_member() then
    raise exception '허용된 사용자만 목록 보기를 바꿀 수 있습니다' using errcode = '42501';
  end if;
  if p_view is null or p_view not in ('sections', 'tabs') then
    raise exception '알 수 없는 목록 보기입니다: %', p_view using errcode = '22023';
  end if;

  update public.members set todo_list_view = p_view where id = auth.uid();
end;
$$;

revoke execute on function public.set_todo_list_view(text) from public, anon;
grant execute on function public.set_todo_list_view(text) to authenticated;

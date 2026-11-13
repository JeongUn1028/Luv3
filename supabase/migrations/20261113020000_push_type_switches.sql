-- 설정 화면의 종류별 알림 스위치(#364, #29 "정한 것" 4번, 시안 4번 A).
-- 각자 자기 설정만 읽고, 바꾸기는 set_push_notify로만 한다(앱 아이콘 숫자 badge_count를 직접 고치지 못하게).

grant select on table public.push_settings to authenticated;

-- 행이 없으면 모든 종류를 켠 것이다(claim_partner_push와 같은 규칙). 화면은 행이 없으면 모두 켬으로 그린다
create policy "push_settings_select_own" on public.push_settings
  for select to authenticated
  using ((select public.is_member()) and member_id = (select auth.uid()));

-- 로그인한 사람의 알림 한 종류를 켜거나 끈다. 스위치마다 따로 불러, 두 스위치를 연달아 눌러도 서로 덮어쓰지 않는다.
-- 행이 없으면 그 종류만 바꾼 행을 만든다(나머지는 켬, 숫자는 0)
create function public.set_push_notify(p_kind text, p_enabled boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_member() then
    raise exception '허용된 사용자만 알림 종류를 바꿀 수 있습니다' using errcode = '42501';
  end if;
  if p_kind is null or p_kind not in ('record', 'comment', 'event') then
    raise exception '알 수 없는 알림 종류입니다: %', p_kind using errcode = '22023';
  end if;
  if p_enabled is null then
    raise exception '켤지 끌지 정해 주세요' using errcode = '22004';
  end if;

  insert into public.push_settings (member_id, notify_record, notify_comment, notify_event)
  values (
    auth.uid(),
    case when p_kind = 'record' then p_enabled else true end,
    case when p_kind = 'comment' then p_enabled else true end,
    case when p_kind = 'event' then p_enabled else true end
  )
  on conflict (member_id) do update set
    notify_record = case when p_kind = 'record' then p_enabled else public.push_settings.notify_record end,
    notify_comment = case when p_kind = 'comment' then p_enabled else public.push_settings.notify_comment end,
    notify_event = case when p_kind = 'event' then p_enabled else public.push_settings.notify_event end;
end;
$$;

revoke execute on function public.set_push_notify(text, boolean) from public, anon;
grant execute on function public.set_push_notify(text, boolean) to authenticated;

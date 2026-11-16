-- 할 일 추가 알림(#376). 상대 활동 알림(#364)에 하고 싶은 것을 새로 추가했을 때를 더한다.
-- 완료·고치기·순서 바꾸기·지우기는 알리지 않는다(사용자 결정). 설정 화면에는 "할 일" 스위치가 더해진다.

-- 행이 없으면 켠 것이다(다른 종류와 같은 규칙). 이미 있는 행도 켠 채로 시작한다
alter table public.push_settings add column notify_todo boolean not null default true;

alter table public.push_sent drop constraint push_sent_kind_check;
alter table public.push_sent add constraint push_sent_kind_check check (kind in ('record', 'comment', 'event', 'todo'));

-- 확인 순서와 돌려주는 값은 partner_push 마이그레이션과 같다. 할 일도 글이 있는지 → 부탁한 사람이 추가했는지 →
-- 추가한 지 10분이 안 됐는지 → 아직 보내지 않았는지 본다. 할 일은 고쳐도 새 행이 생기지 않아 "not-new"는 없다
create or replace function public.claim_partner_push(p_kind text, p_target_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  target_author uuid;
  target_created_at timestamptz;
  is_detached boolean := false;
  recipients jsonb;
begin
  if not public.is_member() then
    raise exception '허용된 사용자만 알림을 부탁할 수 있습니다' using errcode = '42501';
  end if;

  if p_kind = 'record' then
    select author_id, created_at into target_author, target_created_at from public.dates where id = p_target_id;
  elsif p_kind = 'comment' then
    select author_id, created_at into target_author, target_created_at from public.comments where id = p_target_id;
  elsif p_kind = 'event' then
    select author_id, created_at, repeat_parent_id is not null
    into target_author, target_created_at, is_detached
    from public.events where id = p_target_id;
  elsif p_kind = 'todo' then
    select author_id, created_at into target_author, target_created_at from public.todos where id = p_target_id;
  else
    raise exception '알 수 없는 알림 종류입니다: %', p_kind using errcode = '22023';
  end if;

  if target_author is null then
    return jsonb_build_object('status', 'not-found');
  end if;
  if target_author <> caller then
    return jsonb_build_object('status', 'not-author');
  end if;
  -- 반복 일정의 하루를 고치면 새 일정 행이 생기지만, 새로 추가한 일정이 아니라 알리지 않는다(#364)
  if is_detached then
    return jsonb_build_object('status', 'not-new');
  end if;
  -- 저장 직후에만 부탁한다. 오래된 글로 다시 부탁해 알림을 보내지 못하게 한다
  if target_created_at < now() - interval '10 minutes' then
    return jsonb_build_object('status', 'too-old');
  end if;

  -- 10분이 지난 글은 위에서 거절되므로 하루 지난 보낸 기록은 쓸모가 없다. 표가 커지지 않게 함께 지운다
  delete from public.push_sent where sent_at < now() - interval '1 day';
  insert into public.push_sent (kind, target_id) values (p_kind, p_target_id) on conflict do nothing;
  if not found then
    return jsonb_build_object('status', 'already-sent');
  end if;

  with targets as (
    select m.id
    from public.members m
    left join public.push_settings s on s.member_id = m.id
    where m.id <> caller
      and coalesce(
        case p_kind
          when 'record' then s.notify_record
          when 'comment' then s.notify_comment
          when 'event' then s.notify_event
          else s.notify_todo
        end,
        true
      )
      and exists (select 1 from public.push_subscriptions ps where ps.member_id = m.id)
  ),
  counted as (
    insert into public.push_settings (member_id, badge_count)
    select id, 1 from targets
    on conflict (member_id) do update set badge_count = public.push_settings.badge_count + 1
    returning member_id, badge_count
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'badge', c.badge_count,
    'subscriptions', (
      select jsonb_agg(jsonb_build_object('endpoint', ps.endpoint, 'p256dh', ps.p256dh, 'auth', ps.auth) order by ps.endpoint)
      from public.push_subscriptions ps where ps.member_id = c.member_id
    )
  )), '[]'::jsonb)
  into recipients
  from counted c;

  return jsonb_build_object('status', 'ready', 'recipients', recipients);
end;
$$;

-- 할 일 스위치를 받는다. 나머지 규칙은 push_type_switches 마이그레이션과 같다
create or replace function public.set_push_notify(p_kind text, p_enabled boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_member() then
    raise exception '허용된 사용자만 알림 종류를 바꿀 수 있습니다' using errcode = '42501';
  end if;
  if p_kind is null or p_kind not in ('record', 'comment', 'event', 'todo') then
    raise exception '알 수 없는 알림 종류입니다: %', p_kind using errcode = '22023';
  end if;
  if p_enabled is null then
    raise exception '켤지 끌지 정해 주세요' using errcode = '22004';
  end if;

  insert into public.push_settings (member_id, notify_record, notify_comment, notify_event, notify_todo)
  values (
    auth.uid(),
    case when p_kind = 'record' then p_enabled else true end,
    case when p_kind = 'comment' then p_enabled else true end,
    case when p_kind = 'event' then p_enabled else true end,
    case when p_kind = 'todo' then p_enabled else true end
  )
  on conflict (member_id) do update set
    notify_record = case when p_kind = 'record' then p_enabled else public.push_settings.notify_record end,
    notify_comment = case when p_kind = 'comment' then p_enabled else public.push_settings.notify_comment end,
    notify_event = case when p_kind = 'event' then p_enabled else public.push_settings.notify_event end,
    notify_todo = case when p_kind = 'todo' then p_enabled else public.push_settings.notify_todo end;
end;
$$;

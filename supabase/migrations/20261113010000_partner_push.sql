-- 상대 활동 알림(#364). 기록·댓글·일정을 저장한 휴대폰이 서버에 알림을 부탁하면(#29 "정한 것" 6번),
-- 서버가 claim_partner_push로 부탁이 맞는지 확인하고 받을 사람의 구독과 앱 아이콘 숫자를 받아 보낸다.

-- 사람마다 알림 설정과 앱 아이콘 숫자. 행이 없으면 모든 종류를 켠 것이고 숫자는 0이다(처음 보낼 때 만든다)
create table public.push_settings (
  member_id uuid primary key references public.members (id) on delete cascade,
  -- 종류별로 받을지(#29 "정한 것" 4번). 설정 화면 스위치는 이어지는 작업에서 더한다
  notify_record boolean not null default true,
  notify_comment boolean not null default true,
  notify_event boolean not null default true,
  -- 앱을 연 뒤 받은 알림 수(#29 "정한 것" 5번). 보낼 때 1 올려 알림에 담고, 앱을 열면 clear_push_badge가 0으로 한다
  badge_count integer not null default 0 check (badge_count >= 0)
);

alter table public.push_settings enable row level security;
-- 숫자와 설정은 아래 함수로만 바꾼다. 읽기 정책은 설정 화면 스위치와 함께 더한다
revoke all on table public.push_settings from anon, authenticated;

-- 이미 알림을 보낸 글. 같은 글로 두 번 부탁해도(다시 저장, 응답이 끊겨 다시 보냄) 한 번만 보낸다
create table public.push_sent (
  kind text not null check (kind in ('record', 'comment', 'event')),
  target_id uuid not null,
  sent_at timestamptz not null default now(),
  primary key (kind, target_id)
);

alter table public.push_sent enable row level security;
-- claim_partner_push만 쓴다
revoke all on table public.push_sent from anon, authenticated;

-- 알림을 보내도 되는지 확인하고, 보낼 곳을 돌려준다. 확인 순서:
--   글이 있는지 → 부탁한 사람이 썼는지 → "이 날만 고치기"로 생긴 일정이 아닌지 → 만든 지 10분이 안 됐는지 → 아직 보내지 않았는지
-- 받는 사람은 부탁한 사람을 뺀 회원 중 그 종류를 켜 두었고 알림을 켠 기기가 있는 사람이다. 그 사람의 숫자를 1 올린다.
-- 돌려주는 값: {"status": "ready", "recipients": [{"badge": 3, "subscriptions": [{"endpoint", "p256dh", "auth"}]}]}
-- 또는 보내지 않는 이유 {"status": "not-found" | "not-author" | "not-new" | "too-old" | "already-sent"}.
-- 구독은 각자 자기 것만 읽으므로(push_subscriptions RLS) 확인을 모두 통과한 부탁에만 상대 구독을 돌려준다.
-- 구독 값만으로는 알림을 보낼 수 없다(서버만 아는 VAPID 비밀 키가 필요하다)
create function public.claim_partner_push(p_kind text, p_target_id uuid)
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
        case p_kind when 'record' then s.notify_record when 'comment' then s.notify_comment else s.notify_event end,
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

revoke execute on function public.claim_partner_push(text, uuid) from public, anon;
grant execute on function public.claim_partner_push(text, uuid) to authenticated;

-- 알림 서비스가 "이 구독은 없다"고 답한 기기를 지운다. 상대 기기의 구독이라 RLS로는 지울 수 없어 함수로 한다.
-- 구독 주소는 claim_partner_push가 돌려준 것만 알 수 있다
create function public.delete_push_subscriptions(p_endpoints text[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_member() then
    raise exception '허용된 사용자만 구독을 지울 수 있습니다' using errcode = '42501';
  end if;
  delete from public.push_subscriptions where endpoint = any (p_endpoints);
end;
$$;

revoke execute on function public.delete_push_subscriptions(text[]) from public, anon;
grant execute on function public.delete_push_subscriptions(text[]) to authenticated;

-- 앱을 열면(화면이 보이게 되면) 로그인한 사람의 앱 아이콘 숫자를 0으로 한다
create function public.clear_push_badge()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_member() then
    raise exception '허용된 사용자만 숫자를 지울 수 있습니다' using errcode = '42501';
  end if;
  update public.push_settings set badge_count = 0 where member_id = auth.uid() and badge_count <> 0;
end;
$$;

revoke execute on function public.clear_push_badge() from public, anon;
grant execute on function public.clear_push_badge() to authenticated;

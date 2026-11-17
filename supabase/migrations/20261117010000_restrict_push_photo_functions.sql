-- 알림 구독·사진 함수 권한 조이기(#412). 두 사람 중 한 명이 브라우저에서 DB 함수를 직접 불러야 닿는 길들을 막는다.
--   1. 구독 주소는 알림 서비스(애플·구글·모질라) 주소만 받는다. 서버가 저장된 주소로 요청을 보내기 때문이다
--   2. 상대 알림 확인(claim)·되돌리기(release)·사라진 구독 지우기는 서버 경로(비밀 키, service_role)만 부른다.
--      claim은 상대 기기의 구독 주소·키를 돌려주고 delete는 주인을 보지 않고 지워서, 회원이 직접 부르면
--      상대 구독을 알아내 지우거나 save_push_subscription으로 주인을 바꿀 수 있었다
--   3. is_kept_album_file은 회원에게만 답한다(회원이 아니면 null)

-- 1. 알림 서비스 주소만. 경로 앞의 호스트 이름 전체가 같아야 한다(web.push.apple.com.example 같은 주소는 막는다).
-- 지금 남아 있는 다른 주소는 알림을 받을 수 없는 구독이라 지운 뒤 확인을 건다. 기기는 앱을 다시 열면 구독을 다시 저장한다
delete from public.push_subscriptions
where endpoint !~ '^https://(web\.push\.apple\.com|fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com)/';

alter table public.push_subscriptions add constraint push_subscriptions_endpoint_service check (
  endpoint ~ '^https://(web\.push\.apple\.com|fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com)/'
);

-- 2. 서버 경로만. 경로가 세션으로 회원을 확인한 뒤 비밀 키로 부르므로 auth.uid()가 없어 부탁한 사람을 인자로 받는다.
-- 나머지 확인 순서와 돌려주는 값은 partner_push_release 마이그레이션과 같다
drop function public.claim_partner_push(text, uuid);

create function public.claim_partner_push(p_member_id uuid, p_kind text, p_target_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := p_member_id;
  target_author uuid;
  target_created_at timestamptz;
  is_detached boolean := false;
  recipients jsonb;
  claimed_ids uuid[];
  token uuid;
begin
  if caller is null or not exists (select 1 from public.members where id = caller) then
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
  insert into public.push_sent (kind, target_id) values (p_kind, p_target_id) on conflict do nothing
  returning release_token into token;
  if token is null then
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
  )), '[]'::jsonb),
  coalesce(array_agg(c.member_id), '{}')
  into recipients, claimed_ids
  from counted c;

  -- 보내지 못해 되돌릴 때 숫자를 내릴 사람이다. 되돌리는 쪽이 넘기지 않고 여기 적어 둔 사람만 내린다
  update public.push_sent set recipient_ids = claimed_ids where kind = p_kind and target_id = p_target_id;

  return jsonb_build_object('status', 'ready', 'release_token', token, 'recipients', recipients);
end;
$$;

revoke execute on function public.claim_partner_push(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.claim_partner_push(uuid, text, uuid) to service_role;

-- 되돌리기: 서버 경로만 부르므로 회원 확인(auth.uid())은 뺀다. 되돌리기 표 확인은 그대로 둔다
create or replace function public.release_partner_push(p_kind text, p_target_id uuid, p_release_token uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  released_ids uuid[];
begin
  delete from public.push_sent
  where kind = p_kind and target_id = p_target_id and release_token = p_release_token
  returning recipient_ids into released_ids;
  if released_ids is null then
    return;
  end if;

  update public.push_settings
  set badge_count = greatest(badge_count - 1, 0)
  where member_id = any(released_ids);
end;
$$;

revoke execute on function public.release_partner_push(text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.release_partner_push(text, uuid, uuid) to service_role;

-- 사라진 구독 지우기: 서버 경로가 알림 서비스가 "없는 구독"이라고 답한 주소만 넘긴다
create or replace function public.delete_push_subscriptions(p_endpoints text[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.push_subscriptions where endpoint = any (p_endpoints);
end;
$$;

revoke execute on function public.delete_push_subscriptions(text[]) from public, anon, authenticated;
grant execute on function public.delete_push_subscriptions(text[]) to service_role;

-- 3. 회원이 아니면 답하지 않는다(null). false("지워도 됨")로 답하면 세션 없이 부르는 쪽(비밀 키 등)이 쓰는 파일을 지울 수 있어
-- 모른다는 뜻으로 둔다. 이 함수를 쓰는 album_delete_members 정책은 이미 회원만 통과시키므로 회원의 지우기 동작은 그대로다
create or replace function public.is_kept_album_file(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case when public.is_member() then
    exists (select 1 from public.photos where path = p_name or thumb_path = p_name)
    or exists (select 1 from public.photo_trash where path = p_name or thumb_path = p_name)
  end;
$$;

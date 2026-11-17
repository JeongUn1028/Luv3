-- 상대 알림 되돌리기(#409). claim_partner_push는 보내기 전에 보낸 기록(push_sent)을 남기고 숫자를 올린다.
-- 글을 읽지 못했거나 한 기기에도 보내지 못한 일시 오류면, 그 알림은 다시 가지 않고 숫자만 1 오른 채로 남았다.
-- 그때 경로가 release_partner_push로 기록을 지우고 숫자를 내려, 같은 글로 다시 부탁하면 다시 보낼 수 있게 한다.

-- 되돌리기 표: claim이 만들어 경로에만 돌려준다. 글쓴이가 함수를 직접 불러 보낸 기록을 지우고 같은 알림을 되풀이해 보내지 못하게,
-- 이 값을 아는 쪽(그 claim을 부른 경로)만 되돌린다. 경로는 이 값을 응답에 담지 않는다
alter table public.push_sent add column release_token uuid not null default gen_random_uuid();
-- 숫자를 올린 사람. 되돌릴 때 이 사람들만 내린다
alter table public.push_sent add column recipient_ids uuid[] not null default '{}';

-- 돌려주는 값에 release_token을 더하고 받은 사람을 push_sent에 적는다. 나머지는 todo_push 마이그레이션과 같다
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
  claimed_ids uuid[];
  token uuid;
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

-- 보내지 못한 알림을 되돌린다. claim이 준 되돌리기 표가 맞을 때만 보낸 기록을 지우고, 그때 숫자를 올린 사람의 숫자를 1 내린다.
-- 기록을 지우므로 한 번만 되돌릴 수 있다. 그사이 앱을 열어 0이 됐으면 0에 둔다. 확인과 보내기 사이에 글이 지워져도 되돌린다
create function public.release_partner_push(p_kind text, p_target_id uuid, p_release_token uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  released_ids uuid[];
begin
  if not public.is_member() then
    raise exception '허용된 사용자만 알림을 되돌릴 수 있습니다' using errcode = '42501';
  end if;

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

revoke execute on function public.release_partner_push(text, uuid, uuid) from public, anon;
grant execute on function public.release_partner_push(text, uuid, uuid) to authenticated;

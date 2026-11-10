-- 일정·하고 싶은 것은 나중에 저장한 쪽이 앞선 저장을 덮어썼다(#161). 기록(#158)과 같이 판 번호(revision)를 두고,
-- 화면을 연 뒤 바뀌었으면 앱이 저장을 거부한다. 판 번호를 앱이 정하는 이유도 기록과 같다: 응답만 끊긴 저장을 다시 보낼 때
-- 내 앞선 저장인지 상대의 저장인지 가려야 한다. 고치기는 표에 바로 쓰고, 앱이 `revision in (불러온 판, 내 판)` 조건을 붙인다.
alter table public.events add column revision uuid not null default gen_random_uuid();
alter table public.todos add column revision uuid not null default gen_random_uuid();

grant update (revision) on table public.events to authenticated;
-- 새 항목도 앱이 판 번호를 정해 만든다. 다시 저장할 때 같은 id의 행이 내 앞선 시도인지 알아본다
grant insert (revision) on table public.todos to authenticated;
grant update (revision) on table public.todos to authenticated;

-- 판 번호를 넘기지 않고 내용만 고치는 경우(예전 앱, 관리 화면)에도 판 번호를 바꿔야 열어 둔 상대의 화면이 알아챈다.
-- 같은 내용·같은 판 번호로 다시 보낸 요청은 그대로 둔다(응답만 끊긴 저장을 다시 보내도 내 판으로 남게)
create function public.bump_event_revision()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.revision is not distinct from old.revision
    and (new.date, new.start_time, new.title, new.place, new.memo, new.is_together, new.repeat_rule, new.repeat_until, new.end_date)
      is distinct from (old.date, old.start_time, old.title, old.place, old.memo, old.is_together, old.repeat_rule, old.repeat_until, old.end_date)
  then
    new.revision := gen_random_uuid();
  end if;
  return new;
end;
$$;

revoke execute on function public.bump_event_revision() from public, anon, authenticated;

create trigger events_bump_revision
  before update on public.events
  for each row
  execute function public.bump_event_revision();

-- 하고 싶은 것은 내용만 본다. 상대가 완료 체크나 순서만 바꾼 것은 내용 고치기와 겹치지 않아 거부하지 않는다
create function public.bump_todo_revision()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.revision is not distinct from old.revision and new.content is distinct from old.content then
    new.revision := gen_random_uuid();
  end if;
  return new;
end;
$$;

revoke execute on function public.bump_todo_revision() from public, anon, authenticated;

create trigger todos_bump_revision
  before update of content, revision on public.todos
  for each row
  execute function public.bump_todo_revision();

-- 이 날만 고치기도 폼을 연 뒤 상대가 반복 전체를 고쳤으면 거부한다. 요일이 옮겨졌는데 옛 날짜를 건너뛰게 하면 일정이 두 줄이 된다.
-- 새 일정 id를 앱이 정해, 응답만 끊긴 요청을 다시 보내면 "이미 건너뛴 날"로 거부하지 않고 앞서 만든 일정을 돌려준다.
-- 새 인자는 맨 뒤에 기본값 null로 두어, 배포 전 앱이 판 번호 없이 불러도 지금처럼 동작한다. 나머지는 20261109010000과 같다.
drop function public.detach_event_occurrence(uuid, date, date, text, time, text, text);

create function public.detach_event_occurrence(
  p_event_id uuid,
  p_occurrence_date date,
  p_date date,
  p_title text,
  p_start_time time default null,
  p_place text default null,
  p_memo text default null,
  p_expected_revisions uuid[] default null,
  p_new_event_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  parent public.events%rowtype;
  new_id uuid;
begin
  if not public.is_member() then
    raise exception '허용된 사용자만 일정을 고칠 수 있습니다' using errcode = '42501';
  end if;

  -- for share: 판 번호를 견준 뒤 이 함수가 끝날 때까지 상대가 반복 일정을 고치지 못하게 한다.
  -- for key share는 키가 아닌 열을 고치는 update를 막지 않아, 견준 직후 상대가 요일을 옮길 수 있다
  select * into parent from public.events where id = p_event_id and repeat_rule is not null for share;
  if not found then
    raise exception '반복 일정을 찾을 수 없습니다: %', p_event_id using errcode = 'P0002';
  end if;

  -- 앞선 시도가 이미 그날을 떼어 냈다. 그사이 반복 일정이 바뀌었더라도 그 시도는 바뀌기 전에 끝났으므로 성공으로 본다.
  -- 다시 보내기 전에 고친 내용이 있을 수 있어 앞서 만든 일정을 이번 값으로 맞춘다
  if p_new_event_id is not null
    and exists (select 1 from public.events where id = p_new_event_id and repeat_parent_id = p_event_id)
    and exists (select 1 from public.event_exceptions where event_id = p_event_id and date = p_occurrence_date)
  then
    update public.events
    set date = p_date, start_time = p_start_time, title = p_title, place = p_place, memo = p_memo
    where id = p_new_event_id;
    update public.dates set event_date = p_date where event_id = p_new_event_id;
    return p_new_event_id;
  end if;

  if p_expected_revisions is not null and parent.revision <> all(p_expected_revisions) then
    raise exception '화면을 연 뒤 일정이 바뀌었습니다' using errcode = 'P0409';
  end if;

  insert into public.event_exceptions (event_id, date)
  values (p_event_id, p_occurrence_date)
  on conflict do nothing;
  if not found then
    raise exception '이미 건너뛴 날입니다: %', p_occurrence_date using errcode = 'P0002';
  end if;

  insert into public.events (id, date, start_time, title, place, memo, is_together, author_id, repeat_parent_id)
  values (coalesce(p_new_event_id, gen_random_uuid()), p_date, p_start_time, p_title, p_place, p_memo, parent.is_together, parent.author_id, p_event_id)
  returning id into new_id;

  -- 떼어 낸 일정은 반복이 아니라 시작일이 곧 연결 날짜다
  update public.dates set event_id = new_id, event_date = p_date
  where event_id = p_event_id and event_date = p_occurrence_date;

  return new_id;
end;
$$;

revoke execute on function public.detach_event_occurrence(uuid, date, date, text, time, text, text, uuid[], uuid) from public, anon;
grant execute on function public.detach_event_occurrence(uuid, date, date, text, time, text, text, uuid[], uuid) to authenticated;

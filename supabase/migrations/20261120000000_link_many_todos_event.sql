-- 일정 하나에 하고 싶은 것 여러 개 잇기(#495). #471·#472는 일정 하나에 하나만 이었다.
-- 하고 싶은 것 하나에 일정은 여전히 하나다(todos.event_id 한 칸). 반복 일정은 잇지 않는다(트리거 events_reject_repeating_todo_event 그대로).
-- 기록을 남기면 이어진 것이 모두 완료되는 트리거(#473)는 이미 `where event_id = ...`로 모두 고른다.

-- 일정 하나에 여럿을 잇게 유일 인덱스를 일반 인덱스로 바꾼다. 일정을 지울 때 이어진 하고 싶은 것을 찾는 데는 계속 쓴다
drop index public.todos_event_id_key;
create index todos_event_id_idx on public.todos (event_id) where event_id is not null;

-- 일정 폼에서 이어진 하고 싶은 것 목록을 한 번에 바꾼다. 일정 폼은 저장할 때 일정 값을 고친 뒤 목록이 바뀌었으면 이 함수를 부른다.
-- 목록은 순서 없는 묶음으로 다룬다(같은 id가 두 번 와도 하나).
create function public.set_event_todos(
  p_event_id uuid,
  -- 이어 둘 하고 싶은 것 전부. 빈 배열이면 모두 끊는다(일정과 하고 싶은 것은 그대로)
  p_todo_ids uuid[],
  -- 폼을 열 때 이어져 있던 하고 싶은 것 전부. 그사이 상대가 연결을 바꿨으면 덮어쓰지 않고 P0409로 거부한다
  p_expected_todo_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_event public.events%rowtype;
  wanted uuid[] := coalesce(p_todo_ids, '{}');
  expected uuid[] := coalesce(p_expected_todo_ids, '{}');
  linked uuid[];
  added uuid[];
  taken public.todos%rowtype;
begin
  if not public.is_member() then
    raise exception '허용된 사용자만 하고 싶은 것과 이을 수 있습니다' using errcode = '42501';
  end if;
  if array_position(wanted, null) is not null or array_position(expected, null) is not null then
    raise exception '하고 싶은 것 id가 비어 있습니다' using errcode = '22023';
  end if;

  -- 두 사람이 같은 일정의 연결을 동시에 바꿔도 차례로 하게 잠근다
  select * into target_event from public.events where id = p_event_id for update;
  if not found then
    raise exception '일정을 찾을 수 없습니다' using errcode = 'P0002';
  end if;

  linked := array(select id from public.todos where event_id = p_event_id);

  -- 이미 바라는 대로다. 응답만 끊겨 다시 보낸 경우도 여기서 성공으로 끝난다
  if linked @> wanted and wanted @> linked then
    return;
  end if;
  if not (linked @> expected and expected @> linked) then
    raise exception '그사이 하고 싶은 것 연결이 바뀌었습니다' using errcode = 'P0409';
  end if;

  added := array(select distinct id from unnest(wanted) as id where id <> all (linked));
  -- 이어진 것과 새로 이을 것을 한 번에 id 순서로 잠근다. 두 사람이 겹치는 하고 싶은 것을 동시에 바꿔도 서로 기다리다 멈추지 않는다(schedule_todos도 id 순서).
  -- 이어진 목록은 일정을 잠근 뒤 읽었으므로 그사이 바뀌지 않는다(잇고 끊는 함수는 모두 일정을 먼저 잠근다)
  perform 1 from public.todos where event_id = p_event_id or id = any (added) order by id for update;
  if cardinality(added) > 0 then
    if target_event.repeat_rule is not null then
      raise exception '반복 일정은 하고 싶은 것과 잇지 않습니다' using errcode = '22023';
    end if;
    if (select count(*) from public.todos where id = any (added)) < cardinality(added) then
      raise exception '하고 싶은 것을 찾을 수 없습니다' using errcode = 'P0002';
    end if;
    select * into taken from public.todos where id = any (added) and event_id is not null order by id limit 1;
    if found then
      raise exception '이미 일정이 있는 하고 싶은 것입니다' using errcode = 'P0412', detail = taken.event_id::text, hint = taken.id::text;
    end if;
  end if;

  update public.todos set event_id = null where event_id = p_event_id and id <> all (wanted);
  update public.todos set event_id = p_event_id where id = any (added);
end;
$$;

revoke execute on function public.set_event_todos(uuid, uuid[], uuid[]) from public, anon;
grant execute on function public.set_event_todos(uuid, uuid[], uuid[]) to authenticated;

-- 하고 싶은 것 여럿에 새 일정을 잡는다. 새 일정을 만들고 모두 잇는 일을 한 번에 해, 일정만 생기고 잇지 못한 채 남지 않는다.
-- 다시 보내기 규칙은 schedule_todo(#471)와 같다: 같은 일정 id가 이미 있고 같은 하고 싶은 것들이 이어져 있으면 이번 값으로 고치고 성공으로 끝낸다
-- (그사이 상대가 그 일정이나 연결을 바꿨으면 P0409로 거부). 반복 칸을 받지 않아 반복 일정은 만들지 않는다.
create function public.schedule_todos(
  p_todo_ids uuid[],
  p_event_id uuid,
  p_revision uuid,
  p_date date,
  p_title text,
  p_is_together boolean,
  p_start_time time default null,
  p_end_date date default null,
  p_place text default null,
  p_memo text default null,
  -- 다시 보낼 때 고쳐도 되는 판 번호: 저장됐을 수 있는 내 앞선 시도의 판. 이번 판(p_revision)은 늘 넣어 본다
  p_expected_revisions uuid[] default '{}'
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  wanted uuid[];
  linked uuid[];
  taken public.todos%rowtype;
begin
  if not public.is_member() then
    raise exception '허용된 사용자만 일정을 잡을 수 있습니다' using errcode = '42501';
  end if;
  if p_todo_ids is null or array_position(p_todo_ids, null) is not null then
    raise exception '하고 싶은 것 id가 비어 있습니다' using errcode = '22023';
  end if;
  wanted := array(select distinct id from unnest(p_todo_ids) as id);
  if cardinality(wanted) = 0 then
    raise exception '일정을 잡을 하고 싶은 것이 없습니다' using errcode = '22023';
  end if;

  -- 다시 보내는 경우 일정 폼의 저장(set_event_todos)과 같은 차례(일정 → 하고 싶은 것)로 잠가 서로 기다리다 멈추지 않게 한다
  perform 1 from public.events where id = p_event_id for update;
  -- 두 사람이 같은 하고 싶은 것에 동시에 일정을 잡아도 하나만 이어지게 잠근다(id 순서로 잠가 서로 기다리다 멈추지 않게 한다)
  perform 1 from public.todos where id = any (wanted) order by id for update;
  if (select count(*) from public.todos where id = any (wanted)) < cardinality(wanted) then
    raise exception '하고 싶은 것을 찾을 수 없습니다' using errcode = 'P0002';
  end if;

  if exists (select 1 from public.events where id = p_event_id) then
    -- 앞선 시도가 저장됐는데 응답을 못 받은 경우다. 그사이 폼에서 고쳐 다시 눌렀을 수 있어 마지막에 누른 내용이 남게 고친다.
    -- 그사이 상대가 연결을 바꿨거나 그 일정을 고쳤으면(판 번호가 내 시도의 것이 아니면) 덮어쓰지 않고 거부한다
    linked := array(select id from public.todos where event_id = p_event_id);
    if not (linked @> wanted and wanted @> linked) then
      raise exception '그사이 바뀐 일정입니다' using errcode = 'P0409';
    end if;
    update public.events
    set date = p_date, start_time = p_start_time, end_date = p_end_date, title = p_title, place = p_place, memo = p_memo,
      is_together = p_is_together, revision = p_revision
    where id = p_event_id and revision = any (p_expected_revisions || p_revision);
    if not found then
      raise exception '그사이 바뀐 일정입니다' using errcode = 'P0409';
    end if;
    return;
  end if;

  select * into taken from public.todos where id = any (wanted) and event_id is not null order by id limit 1;
  if found then
    raise exception '이미 일정이 있는 하고 싶은 것입니다' using errcode = 'P0412', detail = taken.event_id::text, hint = taken.id::text;
  end if;

  insert into public.events (id, date, start_time, end_date, title, place, memo, is_together, author_id, revision)
  values (p_event_id, p_date, p_start_time, p_end_date, p_title, p_place, p_memo, p_is_together, auth.uid(), p_revision);

  update public.todos set event_id = p_event_id where id = any (wanted);
end;
$$;

revoke execute on function public.schedule_todos(uuid[], uuid, uuid, date, text, boolean, time, date, text, text, uuid[]) from public, anon;
grant execute on function public.schedule_todos(uuid[], uuid, uuid, date, text, boolean, time, date, text, text, uuid[]) to authenticated;

-- 배포하는 사이 예전 앱이 부르는 하나짜리 함수들. 새 앱은 부르지 않는다.
-- 하나짜리 schedule_todo는 여러 개짜리에 하나만 넘긴다
create or replace function public.schedule_todo(
  p_todo_id uuid,
  p_event_id uuid,
  p_revision uuid,
  p_date date,
  p_title text,
  p_is_together boolean,
  p_start_time time default null,
  p_end_date date default null,
  p_place text default null,
  p_memo text default null,
  p_expected_revisions uuid[] default '{}'
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.schedule_todos(
    array[p_todo_id], p_event_id, p_revision, p_date, p_title, p_is_together, p_start_time, p_end_date, p_place, p_memo, p_expected_revisions
  );
end;
$$;

-- 예전 앱의 일정 폼은 이어진 것 중 하나만 보여 주고(조회 순서를 정하지 않아 어느 것인지 정해지지 않는다) 그 하나를 바꾸거나 끊는다.
-- 여러 개 이어진 일정에서 다른 연결은 지우지 않게, "보던 하나(p_expected_todo_id)를 고른 하나(p_todo_id)로 바꾸기"로 다룬다
create or replace function public.set_event_todo(
  p_event_id uuid,
  p_todo_id uuid default null,
  p_expected_todo_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  linked uuid[];
begin
  if not public.is_member() then
    raise exception '허용된 사용자만 하고 싶은 것과 이을 수 있습니다' using errcode = '42501';
  end if;

  perform 1 from public.events where id = p_event_id for update;
  if not found then
    raise exception '일정을 찾을 수 없습니다' using errcode = 'P0002';
  end if;
  linked := array(select id from public.todos where event_id = p_event_id);

  -- 이미 바라는 대로다(고른 것은 이어져 있고 보던 것은 풀려 있다). 응답만 끊겨 다시 보낸 경우도 여기서 성공으로 끝난다
  if (p_todo_id is null or p_todo_id = any (linked))
    and (p_expected_todo_id is null or p_expected_todo_id = p_todo_id or p_expected_todo_id <> all (linked)) then
    return;
  end if;
  -- 폼을 열 때 보던 것이 그대로여야 한다. 아무것도 없던 일정이었으면 그사이 이어진 것이 없어야 한다
  if (p_expected_todo_id is null and cardinality(linked) > 0) or (p_expected_todo_id is not null and p_expected_todo_id <> all (linked)) then
    raise exception '그사이 하고 싶은 것 연결이 바뀌었습니다' using errcode = 'P0409';
  end if;

  perform public.set_event_todos(
    p_event_id,
    array(select id from unnest(linked) as id where id is distinct from p_expected_todo_id)
      || case when p_todo_id is null then '{}'::uuid[] else array[p_todo_id] end,
    linked
  );
end;
$$;

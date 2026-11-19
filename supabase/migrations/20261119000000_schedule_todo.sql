-- 하고 싶은 것에 일정 잡기(#471). 하고 싶은 것 하나에 일정 하나를 잇는다.
-- 일정을 지우면 연결만 풀리고 하고 싶은 것은 남는다(외래 키 on delete set null). 반복 일정은 잇지 않는다.
alter table public.todos add column event_id uuid references public.events (id) on delete set null;

-- 일정 하나에도 하고 싶은 것 하나만 잇는다. 일정을 지울 때 이어진 하고 싶은 것을 찾는 데도 쓴다
create unique index todos_event_id_key on public.todos (event_id) where event_id is not null;

-- 잇기는 아래 함수로만 한다. 앱에는 event_id를 쓸 권한을 주지 않는다(20261103020000의 insert·update 열 권한에 없다)

-- 하고 싶은 것의 "일정 잡기": 새 일정을 만들고 하고 싶은 것에 잇는다. 둘을 한 번에 해, 일정만 생기고 잇지 못한 채 남지 않는다.
-- 일정 id와 판 번호는 앱이 정한다. 응답만 끊겨 다시 보내면 이미 이어진 같은 일정을 이번 값으로 고치고 성공으로 끝낸다(그사이 상대가 고쳤으면 P0409로 거부).
-- 반복 칸을 받지 않아 반복 일정은 만들지 않는다. 일정 값의 검사(제목 길이, 기간 끝 날짜 등)는 events 표의 제약이 한다.
create function public.schedule_todo(
  p_todo_id uuid,
  p_event_id uuid,
  p_revision uuid,
  p_date date,
  p_title text,
  p_is_together boolean,
  -- 비워 둘 수 있는 칸은 앱이 보내지 않아도 되게 기본값을 둔다
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
  target public.todos%rowtype;
begin
  if not public.is_member() then
    raise exception '허용된 사용자만 일정을 잡을 수 있습니다' using errcode = '42501';
  end if;

  -- 두 사람이 같은 하고 싶은 것에 동시에 일정을 잡아도 하나만 이어지게 잠근다
  select * into target from public.todos where id = p_todo_id for update;
  if not found then
    raise exception '하고 싶은 것을 찾을 수 없습니다' using errcode = 'P0002';
  end if;
  if target.event_id = p_event_id then
    -- 앞선 시도가 저장됐는데 응답을 못 받은 경우다. 그사이 폼에서 고쳐 다시 눌렀을 수 있어 마지막에 누른 내용이 남게 고친다.
    -- 그사이 상대가 그 일정을 고쳤으면(판 번호가 내 시도의 것이 아니면) 덮어쓰지 않고 거부한다
    update public.events
    set date = p_date, start_time = p_start_time, end_date = p_end_date, title = p_title, place = p_place, memo = p_memo,
      is_together = p_is_together, revision = p_revision
    where id = p_event_id and revision = any (p_expected_revisions || p_revision);
    if not found then
      raise exception '그사이 바뀐 일정입니다' using errcode = 'P0409';
    end if;
    return;
  end if;
  if target.event_id is not null then
    raise exception '이미 일정이 있는 하고 싶은 것입니다' using errcode = 'P0412', detail = target.event_id::text;
  end if;

  insert into public.events (id, date, start_time, end_date, title, place, memo, is_together, author_id, revision)
  values (p_event_id, p_date, p_start_time, p_end_date, p_title, p_place, p_memo, p_is_together, auth.uid(), p_revision);

  update public.todos set event_id = p_event_id where id = p_todo_id;
end;
$$;

revoke execute on function public.schedule_todo(uuid, uuid, uuid, date, text, boolean, time, date, text, text, uuid[]) from public, anon;
grant execute on function public.schedule_todo(uuid, uuid, uuid, date, text, boolean, time, date, text, text, uuid[]) to authenticated;

-- 하고 싶은 것과 이어진 일정은 반복으로 바꾸지 않는다. 앱은 이어진 일정의 폼에서 반복 칸을 숨기고, 이 트리거는 그사이 이어진 경우를 막는다
create function public.reject_repeating_todo_event()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.repeat_rule is not null and exists (select 1 from public.todos where event_id = new.id) then
    raise exception '하고 싶은 것과 이어진 일정은 반복하지 않습니다' using errcode = '22023';
  end if;
  return new;
end;
$$;

revoke execute on function public.reject_repeating_todo_event() from public, anon, authenticated;

create trigger events_reject_repeating_todo_event
  before update of repeat_rule on public.events
  for each row
  when (new.repeat_rule is not null)
  execute function public.reject_repeating_todo_event();

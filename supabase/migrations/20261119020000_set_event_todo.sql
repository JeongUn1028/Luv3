-- 일정 폼에서 하고 싶은 것 잇기·끊기(#472). #471은 하고 싶은 것 쪽에서 새 일정을 만들며 잇고(schedule_todo),
-- 이 함수는 이미 있는 일정을 고치면서 하고 싶은 것을 고르거나 연결을 끊는다. 일정 폼은 저장할 때 일정 값을 고친 뒤 연결이 바뀌었으면 이 함수를 부른다.
-- 하고 싶은 것 하나에 일정 하나, 반복 일정은 잇지 않는 규칙은 #471과 같다(유일 인덱스·트리거가 함께 지킨다).
create function public.set_event_todo(
  p_event_id uuid,
  -- 이을 하고 싶은 것. null이면 연결만 끊는다(일정과 하고 싶은 것은 그대로). 비워 둘 수 있는 칸은 앱이 보내지 않아도 되게 기본값을 둔다
  p_todo_id uuid default null,
  -- 폼을 열 때 이어져 있던 하고 싶은 것(없었으면 null). 그사이 상대가 연결을 바꿨으면 덮어쓰지 않고 P0409로 거부한다
  p_expected_todo_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_event public.events%rowtype;
  current_todo_id uuid;
  target_todo public.todos%rowtype;
begin
  if not public.is_member() then
    raise exception '허용된 사용자만 하고 싶은 것과 이을 수 있습니다' using errcode = '42501';
  end if;

  -- 두 사람이 같은 일정의 연결을 동시에 바꿔도 차례로 하게 잠근다
  select * into target_event from public.events where id = p_event_id for update;
  if not found then
    raise exception '일정을 찾을 수 없습니다' using errcode = 'P0002';
  end if;

  select id into current_todo_id from public.todos where event_id = p_event_id for update;
  -- 이미 바라는 대로다. 응답만 끊겨 다시 보낸 경우도 여기서 성공으로 끝난다
  if current_todo_id is not distinct from p_todo_id then
    return;
  end if;
  if current_todo_id is distinct from p_expected_todo_id then
    raise exception '그사이 하고 싶은 것 연결이 바뀌었습니다' using errcode = 'P0409';
  end if;

  if p_todo_id is not null then
    if target_event.repeat_rule is not null then
      raise exception '반복 일정은 하고 싶은 것과 잇지 않습니다' using errcode = '22023';
    end if;
    select * into target_todo from public.todos where id = p_todo_id for update;
    if not found then
      raise exception '하고 싶은 것을 찾을 수 없습니다' using errcode = 'P0002';
    end if;
    if target_todo.event_id is not null then
      raise exception '이미 일정이 있는 하고 싶은 것입니다' using errcode = 'P0412', detail = target_todo.event_id::text;
    end if;
  end if;

  if current_todo_id is not null then
    update public.todos set event_id = null where id = current_todo_id;
  end if;
  if p_todo_id is not null then
    update public.todos set event_id = p_event_id where id = p_todo_id;
  end if;
end;
$$;

revoke execute on function public.set_event_todo(uuid, uuid, uuid) from public, anon;
grant execute on function public.set_event_todo(uuid, uuid, uuid) to authenticated;

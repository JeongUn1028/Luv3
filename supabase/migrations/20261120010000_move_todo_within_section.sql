-- 순서 바꾸기를 같은 구역 안에서만 한다(#497).
-- 목록이 '일정 잡힌 것(날짜순, 손으로 바꾸지 않음) / 아직(정한 순서)'으로 나뉘어, 바로 위·아래 이웃도 같은 구역(일정이 있는지 없는지)에서 찾는다.
-- 예전처럼 구역을 가리지 않으면 '아직'에서 위로 옮겼을 때 화면에 없는 일정 잡힌 항목과 자리를 바꿔 아무것도 바뀌지 않은 것처럼 보인다.
-- create or replace라 실행 권한(authenticated만)은 그대로 남는다.
create or replace function public.move_todo(p_id uuid, p_offset int)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_order bigint;
  target_has_event boolean;
  neighbor_id uuid;
  neighbor_order bigint;
begin
  if not public.is_member() then
    raise exception '허용된 사용자만 순서를 바꿀 수 있습니다' using errcode = '42501';
  end if;
  if p_offset is null or p_offset not in (-1, 1) then
    raise exception '한 번에 한 칸씩 옮깁니다: %', p_offset using errcode = '22023';
  end if;

  -- 두 사람이 동시에 옮겨도 같은 자리를 두 번 바꾸지 않도록, 완료하지 않은 항목을 잠그고 읽는다
  perform 1 from public.todos where completed_at is null order by sort_order for update;

  select sort_order, event_id is not null into target_order, target_has_event
  from public.todos where id = p_id and completed_at is null;
  if not found then
    raise exception '옮길 항목을 찾을 수 없습니다(지웠거나 완료한 항목)' using errcode = 'P0002';
  end if;

  if p_offset < 0 then
    select id, sort_order into neighbor_id, neighbor_order
    from public.todos
    where completed_at is null and (event_id is not null) = target_has_event and sort_order < target_order
    order by sort_order desc
    limit 1;
  else
    select id, sort_order into neighbor_id, neighbor_order
    from public.todos
    where completed_at is null and (event_id is not null) = target_has_event and sort_order > target_order
    order by sort_order
    limit 1;
  end if;

  if neighbor_id is null then
    return;
  end if;

  update public.todos
  set sort_order = case when id = p_id then neighbor_order else target_order end
  where id in (p_id, neighbor_id);
end;
$$;

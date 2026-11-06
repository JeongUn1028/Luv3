-- 하루만 고칠 때 시간·장소·메모는 비어 있을 수 있다. 앱에서 null 대신 생략할 수 있게 뒤로 옮겨 기본값을 준다.
-- 이 함수를 부르는 코드는 아직 배포되지 않아 바로 바꿔도 된다.
drop function public.detach_event_occurrence(uuid, date, date, time, text, text, text);

-- 반복 중 하루만 고친다: 그날을 건너뛰게 하고 평범한 일정 한 줄을 따로 만든다. 새 일정의 id를 돌려준다.
-- 함께 여부와 작성자는 반복 일정을 따른다. 상대가 고쳐도 원래 작성자를 유지해야 해서 security definer로 넣는다
-- (일반 insert는 작성자가 로그인한 사람이어야 한다). 고치는 사이 반복 일정이 지워졌거나 그날을 이미 건너뛰었으면 no_data_found로 알린다.
-- 함께 고치면 일정이 두 줄 생기므로 건너뛴 날을 다시 받지 않는다. 읽은 뒤 지워지지 않게 반복 일정을 잠근다.
create function public.detach_event_occurrence(
  p_event_id uuid,
  p_occurrence_date date,
  p_date date,
  p_title text,
  p_start_time time default null,
  p_place text default null,
  p_memo text default null
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

  select * into parent from public.events where id = p_event_id and repeat_rule is not null for key share;
  if not found then
    raise exception '반복 일정을 찾을 수 없습니다: %', p_event_id using errcode = 'P0002';
  end if;

  insert into public.event_exceptions (event_id, date)
  values (p_event_id, p_occurrence_date)
  on conflict do nothing;
  if not found then
    raise exception '이미 건너뛴 날입니다: %', p_occurrence_date using errcode = 'P0002';
  end if;

  insert into public.events (date, start_time, title, place, memo, is_together, author_id, repeat_parent_id)
  values (p_date, p_start_time, p_title, p_place, p_memo, parent.is_together, parent.author_id, p_event_id)
  returning id into new_id;

  return new_id;
end;
$$;

revoke execute on function public.detach_event_occurrence(uuid, date, date, text, time, text, text) from public, anon;
grant execute on function public.detach_event_occurrence(uuid, date, date, text, time, text, text) to authenticated;

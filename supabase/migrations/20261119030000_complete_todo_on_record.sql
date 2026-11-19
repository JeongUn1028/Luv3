-- 하고 싶은 것에 이어진 일정(#471)으로 기록을 남기면 다녀온 것이 분명하므로 하고 싶은 것을 완료로 옮긴다(#473).
-- 기록이 일정과 이어지는 길(`create_date_record`의 "기록 남기기", `link_date_record`의 "일정과 잇기")이 모두 `dates.event_id`를 쓰므로
-- 그 칸에 트리거를 걸어 기록 저장과 같은 트랜잭션에서 완료한다. 기록만 저장되고 완료가 빠지는 일이 없다.
-- 기록을 지우거나 연결을 끊어도 완료는 되돌리지 않는다(다녀온 사실은 그대로, 필요하면 손으로 체크를 푼다).
-- 완료 체크처럼 판 번호는 바꾸지 않아 열어 둔 고치기 화면의 저장을 막지 않는다.
create function public.complete_todo_on_record()
returns trigger
language plpgsql
-- 앱 사용자는 todos의 완료 칸을 바꿀 수 있지만, 기록 저장 함수 밖에서 불려도 권한에 기대지 않게 한다
security definer
set search_path = ''
as $$
begin
  update public.todos
  set completed_at = now()
  where event_id = new.event_id
    and completed_at is null;
  return null;
end;
$$;

revoke execute on function public.complete_todo_on_record() from public, anon, authenticated;

create trigger dates_complete_todo_on_insert
  after insert on public.dates
  for each row
  when (new.event_id is not null)
  execute function public.complete_todo_on_record();

create trigger dates_complete_todo_on_link
  after update of event_id on public.dates
  for each row
  when (new.event_id is not null and new.event_id is distinct from old.event_id)
  execute function public.complete_todo_on_record();

-- 반대 방향: 이미 기록이 있는 일정에 하고 싶은 것을 이어도(일정 폼의 "하고 싶은 것과 잇기", #472) 다녀온 것이 분명하므로 함께 완료한다
create function public.complete_todo_on_recorded_event()
returns trigger
language plpgsql
-- 기록을 읽는 권한에 기대지 않게 한다(잇는 함수 밖에서 불려도 같게)
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.dates where event_id = new.event_id) then
    new.completed_at := now();
  end if;
  return new;
end;
$$;

revoke execute on function public.complete_todo_on_recorded_event() from public, anon, authenticated;

create trigger todos_complete_on_recorded_event
  before update of event_id on public.todos
  for each row
  when (new.event_id is not null and new.event_id is distinct from old.event_id and new.completed_at is null)
  execute function public.complete_todo_on_recorded_event();

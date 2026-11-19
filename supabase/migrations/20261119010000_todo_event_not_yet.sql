-- 지난 일정 묻기(#471 ②). 하고 싶은 것에 이어진 일정 날짜가 지나면 "다녀오셨나요? 완료로 옮길까요?"를 묻고,
-- [아직]을 누르면 그때 일정의 마지막 날(기간 일정은 끝 날짜)을 여기에 적는다. 두 사람이 같이 보므로 한 사람이 누르면 둘 다 묻는 칸이 사라진다.
-- 날짜를 기억하는 이유: 일정을 미루면 마지막 날이 달라져, 미룬 날짜가 또 지났을 때 다시 묻는다(사용자 결정).
alter table public.todos add column event_not_yet_date date;

-- [아직]은 목록에서 표에 바로 쓴다(완료 체크와 같다). 판 번호는 바꾸지 않는다: 내용 고치기와 겹치지 않는다(bump_todo_revision은 내용만 본다)
grant update (event_not_yet_date) on table public.todos to authenticated;

-- 다른 일정으로 바뀌거나 일정을 지워 연결이 풀리면(on delete set null도 이 표의 update라 여기를 지난다) 앞 일정에 누른 [아직]은 지운다.
-- 남겨 두면 새로 이은 일정의 마지막 날이 우연히 같을 때 묻지 않는다
create function public.clear_todo_event_not_yet()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.event_not_yet_date := null;
  return new;
end;
$$;

revoke execute on function public.clear_todo_event_not_yet() from public, anon, authenticated;

create trigger todos_clear_event_not_yet
  before update of event_id on public.todos
  for each row
  when (new.event_id is distinct from old.event_id)
  execute function public.clear_todo_event_not_yet();

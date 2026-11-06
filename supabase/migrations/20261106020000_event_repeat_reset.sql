-- 반복 일정의 시작 날짜나 규칙을 바꾸면 반복을 새로 시작한다(#27). 건너뛰는 날은 날짜로 저장돼서 새 날짜와 어긋난다.
-- 건너뛴 날 기록을 비우고, 따로 고친 일정은 독립 일정으로 남겨 원래 일정을 지워도 함께 사라지지 않게 한다.
-- 제목·시간·장소·끝나는 날만 고칠 때는 그대로 둔다.
create function public.reset_event_repeat_details()
returns trigger
language plpgsql
-- 따로 고친 일정의 원래 반복은 앱에서 바꿀 수 없는 칸이다
security definer
set search_path = ''
as $$
begin
  delete from public.event_exceptions where event_id = new.id;
  update public.events set repeat_parent_id = null where repeat_parent_id = new.id;
  return null;
end;
$$;

revoke execute on function public.reset_event_repeat_details() from public, anon, authenticated;

create trigger events_reset_repeat_details
  after update of date, repeat_rule on public.events
  for each row
  when (old.date is distinct from new.date or old.repeat_rule is distinct from new.repeat_rule)
  execute function public.reset_event_repeat_details();

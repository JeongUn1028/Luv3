-- 여행처럼 여러 날 이어지는 일정을 하나로 등록한다(#176). 비어 있으면 하루 일정이고, 기존 일정은 바뀌지 않는다.
-- 끝 날짜가 시작일과 같은 값을 막아, 하루 일정을 두 가지(null, 같은 날)로 저장하지 않게 한다.
-- 반복 펼치기와 "이 날만 고치기"가 기간까지 다루면 복잡해지므로 기간과 반복은 함께 쓰지 못한다.
alter table public.events
  add column end_date date,
  add constraint events_end_date_after_date check (end_date is null or end_date > date),
  add constraint events_end_date_without_repeat check (end_date is null or repeat_rule is null);

-- 끝 날짜도 두 사람 모두 고칠 수 있다
grant update (end_date) on table public.events to authenticated;

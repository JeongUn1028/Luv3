-- 함께 하는 일정과 개인 일정을 나눠 캘린더에 다른 색 형광펜으로 칠한다(#61).
-- 이미 저장된 일정과 값을 적지 않은 새 일정은 함께 하는 일정으로 본다(커플 공유 캘린더라 대부분이 함께 하는 일정이다).
alter table public.events add column is_together boolean not null default true;

-- 두 사람 모두 서로의 일정을 고칠 수 있으므로, 함께/개인도 고칠 수 있는 칸에 더한다
grant update (is_together) on table public.events to authenticated;

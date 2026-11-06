-- 매주·매달·매년 반복되는 일정(#27). 규칙만 저장하고 날짜는 화면에 그릴 때 계산한다(src/lib/events/recurrence.ts).
-- 기존 일정은 repeat_rule이 null이라 그대로 한 번짜리다.
alter table public.events
  add column repeat_rule text check (repeat_rule in ('weekly', 'monthly', 'yearly')),
  -- 이 날까지 반복한다(그날 포함). null이면 계속 반복한다
  add column repeat_until date,
  -- 반복 중 하루만 고쳐 따로 나온 일정이면 원래 반복 일정. 반복 전체를 지우면 함께 지운다
  add column repeat_parent_id uuid references public.events (id) on delete cascade,
  add constraint events_repeat_until_after_date check (repeat_until is null or (repeat_rule is not null and repeat_until > date));

create index events_repeat_parent_id_idx on public.events (repeat_parent_id);

-- 반복 규칙은 두 사람 모두 고칠 수 있다. 따로 나온 일정의 원래 반복은 바꾸지 않는다
grant update (repeat_rule, repeat_until) on table public.events to authenticated;

-- 따로 나온 일정은 detach_event_occurrence로만 만든다
alter policy "events_insert_members" on public.events
  with check ((select public.is_member()) and author_id = (select auth.uid()) and repeat_parent_id is null);

-- 반복 중 건너뛰는 날. 하루만 지우거나, 하루만 고쳐 따로 나온 날이다
create table public.event_exceptions (
  event_id uuid not null references public.events (id) on delete cascade,
  date date not null,
  primary key (event_id, date)
);

alter table public.event_exceptions enable row level security;

revoke all on table public.event_exceptions from anon;
-- 건너뛰는 날은 넣고 지우기만 한다
revoke update on table public.event_exceptions from authenticated;

create policy "event_exceptions_select_members" on public.event_exceptions
  for select to authenticated
  using ((select public.is_member()));

create policy "event_exceptions_insert_members" on public.event_exceptions
  for insert to authenticated
  with check (
    (select public.is_member())
    and exists (select 1 from public.events where id = event_id and repeat_rule is not null)
  );

create policy "event_exceptions_delete_members" on public.event_exceptions
  for delete to authenticated
  using ((select public.is_member()));

-- 반복 중 하루만 고친다: 그날을 건너뛰게 하고 평범한 일정 한 줄을 따로 만든다. 새 일정의 id를 돌려준다.
-- 함께 여부와 작성자는 반복 일정을 따른다. 상대가 고쳐도 원래 작성자를 유지해야 해서 security definer로 넣는다
-- (일반 insert는 작성자가 로그인한 사람이어야 한다). 고치는 사이 반복 일정이 지워졌거나 그날을 이미 건너뛰었으면 no_data_found로 알린다.
-- 함께 고치면 일정이 두 줄 생기므로 건너뛴 날을 다시 받지 않는다. 읽은 뒤 지워지지 않게 반복 일정을 잠근다.
create function public.detach_event_occurrence(
  p_event_id uuid,
  p_occurrence_date date,
  p_date date,
  p_start_time time,
  p_title text,
  p_place text,
  p_memo text
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

revoke execute on function public.detach_event_occurrence(uuid, date, date, time, text, text, text) from public, anon;
grant execute on function public.detach_event_occurrence(uuid, date, date, time, text, text, text) to authenticated;

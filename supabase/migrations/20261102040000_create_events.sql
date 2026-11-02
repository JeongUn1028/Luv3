-- 공유 캘린더 일정. 허용된 두 사람(members)만 보고 쓰며, 두 사람 모두 서로의 일정을 고치고 지울 수 있다.
-- 날짜·시간은 시간대 없는 한국 시간 값으로 저장한다: 둘 다 한국에서 쓰고, 화면에도 적은 그대로 보여 주기 위해서다.
create table public.events (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  -- null이면 종일 일정
  start_time time,
  title text not null check (char_length(title) between 1 and 100),
  place text check (char_length(place) <= 100),
  memo text check (char_length(memo) <= 2000),
  author_id uuid not null default auth.uid() references public.members (id),
  created_at timestamptz not null default now()
);

-- 달력은 한 달(앞뒤 주 포함) 범위로 읽고, 같은 날 안에서는 종일 → 시간 순으로 보여 준다
create index events_date_idx on public.events (date, start_time nulls first);

alter table public.events enable row level security;

-- 비로그인(anon)은 정책 이전에 권한 단계에서 막는다
revoke all on table public.events from anon;

-- 두 사람 모두 일정을 고칠 수 있지만, 작성자·만든 시각은 처음 값으로 고정한다(id도 바꾸지 않는다)
revoke update on table public.events from authenticated;
grant update (date, start_time, title, place, memo) on table public.events to authenticated;

create policy "events_select_members" on public.events
  for select to authenticated
  using ((select public.is_member()));

create policy "events_insert_members" on public.events
  for insert to authenticated
  with check ((select public.is_member()) and author_id = (select auth.uid()));

create policy "events_update_members" on public.events
  for update to authenticated
  using ((select public.is_member()))
  with check ((select public.is_member()));

create policy "events_delete_members" on public.events
  for delete to authenticated
  using ((select public.is_member()));

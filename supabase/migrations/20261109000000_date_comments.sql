-- 기록 댓글(#18). 사진별 한마디(photos.caption)와 달리, 서로의 기록에 남기는 짧은 반응이다.
-- 두 사람 모두 어느 기록에나 남기고 함께 읽는다. 고치기는 없고, 지우는 것은 쓴 사람만 한다.

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  -- 기록을 지우면 그 기록의 댓글도 함께 지운다
  date_id uuid not null references public.dates (id) on delete cascade,
  content text not null check (char_length(content) between 1 and 200),
  author_id uuid not null default auth.uid() references public.members (id),
  created_at timestamptz not null default now()
);

-- 상세 화면은 기록 하나의 댓글을 남긴 순서대로 읽는다
create index comments_date_id_created_at_idx on public.comments (date_id, created_at);
-- 작성자(members)를 지울 때 그 사람의 댓글을 찾는다
create index comments_author_id_idx on public.comments (author_id);

alter table public.comments enable row level security;

-- 비로그인(anon)은 정책 이전에 권한 단계에서 막는다
revoke all on table public.comments from anon;
-- TRUNCATE는 RLS를 거치지 않아 쓴 사람만 지우는 규칙을 건너뛴다. 쓰지 않는 권한도 함께 뺀다
revoke truncate, references, trigger on table public.comments from authenticated;

-- 남길 때는 기록과 내용(과 id)만 적는다. 작성자·남긴 시각은 기본값으로 정한다
revoke insert on table public.comments from authenticated;
grant insert (id, date_id, content) on table public.comments to authenticated;

-- 댓글은 고치지 않는다. 잘못 남겼으면 지우고 다시 쓴다
revoke update on table public.comments from authenticated;

create policy "comments_select_members" on public.comments
  for select to authenticated
  using ((select public.is_member()));

create policy "comments_insert_members" on public.comments
  for insert to authenticated
  with check ((select public.is_member()) and author_id = (select auth.uid()));

create policy "comments_delete_author" on public.comments
  for delete to authenticated
  using ((select public.is_member()) and author_id = (select auth.uid()));

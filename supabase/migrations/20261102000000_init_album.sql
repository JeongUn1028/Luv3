-- 데이트 앨범 초기 스키마: 허용된 두 사람(members)만 기록(dates)·사진(photos)·Storage(album)에 접근한다.

-- members: 허용목록. 행 추가·수정은 대시보드(서비스 키)에서만 한다.
create table public.members (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  nickname text not null check (char_length(nickname) between 1 and 20),
  created_at timestamptz not null default now()
);

-- 정책 안에서 members를 직접 조회하면 members의 RLS가 다시 실행돼 무한 재귀가 나므로
-- security definer 함수로 감싼다. search_path를 비워 함수 하이재킹을 막는다.
create function public.is_member()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.members where id = (select auth.uid())
  );
$$;

revoke execute on function public.is_member() from public, anon;
grant execute on function public.is_member() to authenticated;

-- dates: 데이트 기록 하나 = 앨범 한 장
create table public.dates (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  title text not null check (char_length(title) between 1 and 100),
  place text check (char_length(place) <= 100),
  memo text check (char_length(memo) <= 2000),
  cover_photo_id uuid,
  author_id uuid not null default auth.uid() references public.members (id),
  created_at timestamptz not null default now()
);

create index dates_date_idx on public.dates (date desc, created_at desc);

-- photos: 기록에 딸린 사진. 경로는 버킷 이름 없이 {date_id}/{photo_id}.jpg
create table public.photos (
  id uuid primary key default gen_random_uuid(),
  date_id uuid not null references public.dates (id) on delete cascade,
  path text not null,
  thumb_path text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index photos_date_id_idx on public.photos (date_id, sort_order);

-- 대표 사진이 지워지면 기록은 남기고 대표 사진만 비운다
alter table public.dates
  add constraint dates_cover_photo_id_fkey
  foreign key (cover_photo_id) references public.photos (id) on delete set null;

create index dates_cover_photo_id_idx on public.dates (cover_photo_id);

-- RLS
alter table public.members enable row level security;
alter table public.dates enable row level security;
alter table public.photos enable row level security;

-- 비로그인(anon)은 정책 이전에 권한 단계에서 막는다
revoke all on table public.members, public.dates, public.photos from anon;

create policy "members_select_members" on public.members
  for select to authenticated
  using ((select public.is_member()));

create policy "dates_select_members" on public.dates
  for select to authenticated
  using ((select public.is_member()));

create policy "dates_insert_members" on public.dates
  for insert to authenticated
  with check ((select public.is_member()) and author_id = (select auth.uid()));

create policy "dates_update_members" on public.dates
  for update to authenticated
  using ((select public.is_member()))
  with check ((select public.is_member()));

create policy "dates_delete_members" on public.dates
  for delete to authenticated
  using ((select public.is_member()));

create policy "photos_select_members" on public.photos
  for select to authenticated
  using ((select public.is_member()));

create policy "photos_insert_members" on public.photos
  for insert to authenticated
  with check ((select public.is_member()));

create policy "photos_update_members" on public.photos
  for update to authenticated
  using ((select public.is_member()))
  with check ((select public.is_member()));

create policy "photos_delete_members" on public.photos
  for delete to authenticated
  using ((select public.is_member()));

-- Storage: private 버킷. 리사이즈한 JPEG/WebP만, 한 장 5MB까지
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('album', 'album', false, 5242880, array['image/jpeg', 'image/webp']);

create policy "album_select_members" on storage.objects
  for select to authenticated
  using (bucket_id = 'album' and (select public.is_member()));

create policy "album_insert_members" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'album' and (select public.is_member()));

create policy "album_update_members" on storage.objects
  for update to authenticated
  using (bucket_id = 'album' and (select public.is_member()))
  with check (bucket_id = 'album' and (select public.is_member()));

create policy "album_delete_members" on storage.objects
  for delete to authenticated
  using (bucket_id = 'album' and (select public.is_member()));

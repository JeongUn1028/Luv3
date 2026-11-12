-- 지운 사진 휴지통(#311). 기록을 지우거나 고치기에서 사진을 빼면 앱이 Storage 파일을 바로 지워 되살릴 수 없었다.
-- 이제 사진 행이 지워질 때 파일 경로와 기록 날짜·제목을 휴지통에 남기고, 파일은 매달 정리 작업(/api/photo-cleanup)이
-- 보관 기간(30일, src/lib/photos/trash.ts)이 지난 것만 지운다.
-- 앱의 지우기 흐름(기록 삭제, 저장 함수 안의 사진 빼기, 모음 빼기의 cascade)을 하나하나 고치지 않고 트리거로 모두 잡는다.

-- 1. 휴지통 표. 기록이 지워져도 남아야 하므로 기록·사진에 FK를 걸지 않는다
create table public.photo_trash (
  id uuid primary key default gen_random_uuid(),
  -- 같은 사진이 두 번 들어오지 않게 한다. 기록째 지울 때 두 트리거가 모두 넣으려 하기 때문이다(아래 on conflict)
  photo_id uuid not null unique,
  date_id uuid not null,
  path text not null,
  thumb_path text not null,
  -- 휴지통 화면에서 어떤 기록의 사진인지 보여 준다. 기록째 지운 뒤에는 기록 표에서 찾을 수 없어 지울 때 옮겨 둔다
  record_date date,
  record_title text,
  taken_at timestamptz,
  deleted_with_record boolean not null,
  -- 지운 회원. 정리 작업처럼 회원이 아닌 쪽이 지우면 비어 있다
  deleted_by uuid,
  deleted_at timestamptz not null default now()
);

-- 정리 작업이 기간이 지난 행을 고른다
create index photo_trash_deleted_at_idx on public.photo_trash (deleted_at);

-- 정리 작업(비밀 키)만 읽고 지운다. 되살리기 화면의 읽기 권한은 다음 PR에서 연다
alter table public.photo_trash enable row level security;
revoke all on table public.photo_trash from anon;
revoke all on table public.photo_trash from authenticated;

-- 2. 고치기에서 뺀 사진·모음을 뺄 때의 cascade: 기록이 아직 있으므로 기록 표에서 날짜·제목을 읽는다
create function public.trash_deleted_photo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.photo_trash
    (photo_id, date_id, path, thumb_path, record_date, record_title, taken_at, deleted_with_record, deleted_by)
  select old.id, old.date_id, old.path, old.thumb_path, d.date, d.title, old.taken_at, false, auth.uid()
  from (select 1) as one
  left join public.dates d on d.id = old.date_id
  on conflict (photo_id) do update set
    date_id = excluded.date_id,
    path = excluded.path,
    thumb_path = excluded.thumb_path,
    record_date = coalesce(excluded.record_date, public.photo_trash.record_date),
    record_title = coalesce(excluded.record_title, public.photo_trash.record_title),
    taken_at = excluded.taken_at,
    deleted_with_record = excluded.deleted_with_record,
    deleted_by = excluded.deleted_by,
    deleted_at = excluded.deleted_at
  -- 같은 문장(기록째 지움)에서 두 트리거가 넣을 때는 now()가 같아 먼저 넣은 행을 그대로 둔다.
  -- 같은 사진 id가 다시 들어왔다가 나중에 또 지워졌을 때만 새로 고쳐, 먼저 지운 날로 30일을 세지 않게 한다
  where public.photo_trash.deleted_at < excluded.deleted_at;
  return old;
end;
$$;

create trigger photos_to_trash
  after delete on public.photos
  for each row execute function public.trash_deleted_photo();

-- 3. 기록째 지울 때: cascade로 사진 행이 지워질 때는 기록 행이 이미 사라져 날짜·제목을 읽을 수 없다.
-- 그래서 기록 행을 지우기 직전에 그 사진들을 먼저 넣고, 뒤이은 2번 트리거는 같은 사진이라 건너뛴다
create function public.trash_photos_of_deleted_record()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.photo_trash
    (photo_id, date_id, path, thumb_path, record_date, record_title, taken_at, deleted_with_record, deleted_by)
  select p.id, p.date_id, p.path, p.thumb_path, old.date, old.title, p.taken_at, true, auth.uid()
  from public.photos p
  where p.date_id = old.id
  on conflict (photo_id) do update set
    date_id = excluded.date_id,
    path = excluded.path,
    thumb_path = excluded.thumb_path,
    record_date = coalesce(excluded.record_date, public.photo_trash.record_date),
    record_title = coalesce(excluded.record_title, public.photo_trash.record_title),
    taken_at = excluded.taken_at,
    deleted_with_record = excluded.deleted_with_record,
    deleted_by = excluded.deleted_by,
    deleted_at = excluded.deleted_at
  -- 같은 문장(기록째 지움)에서 두 트리거가 넣을 때는 now()가 같아 먼저 넣은 행을 그대로 둔다.
  -- 같은 사진 id가 다시 들어왔다가 나중에 또 지워졌을 때만 새로 고쳐, 먼저 지운 날로 30일을 세지 않게 한다
  where public.photo_trash.deleted_at < excluded.deleted_at;
  return old;
end;
$$;

create trigger dates_photos_to_trash
  before delete on public.dates
  for each row execute function public.trash_photos_of_deleted_record();

-- 트리거로만 부른다
revoke execute on function public.trash_deleted_photo() from public, anon, authenticated;
revoke execute on function public.trash_photos_of_deleted_record() from public, anon, authenticated;

-- 4. Storage: 회원은 기록이 쓰는 사진과 휴지통 사진의 파일을 지울 수 없다.
-- 앱은 이제 이 파일을 지우지 않지만, 캐시된 예전 앱은 기록을 지울 때 파일을 먼저 지운다. 휴지통 보호를 앱에만 맡기지 않는다.
-- 저장 실패로 남은 새 사진, 바꾼 뒤의 예전 커플 사진처럼 어디에도 이어지지 않은 파일은 지금처럼 지울 수 있다.
-- 정책 안에서 회원이 읽을 수 없는 휴지통을 보려고 security definer로 둔다. 두 사람만 써서 표가 작아 경로 색인은 두지 않는다
create function public.is_kept_album_file(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.photos where path = p_name or thumb_path = p_name)
    or exists (select 1 from public.photo_trash where path = p_name or thumb_path = p_name);
$$;

revoke execute on function public.is_kept_album_file(text) from public, anon;
grant execute on function public.is_kept_album_file(text) to authenticated;

drop policy "album_delete_members" on storage.objects;
create policy "album_delete_members" on storage.objects
  for delete to authenticated
  using (bucket_id = 'album' and (select public.is_member()) and not public.is_kept_album_file(name));

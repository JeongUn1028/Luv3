-- 기록(dates)·사진(photos)은 저장 함수로만 만들고 고치게 한다(#170).
-- 지금은 회원이 표를 직접 고칠 수 있어 작성자(author_id)·판 번호(revision)·일정 연결(event_id, event_date)을 바꾸거나,
-- 사진 경로(photos.path)를 다른 파일로 바꾼 뒤 그 사진을 빼서 남의 파일을 지우게 할 수 있었다.
-- 화면에만 있던 규칙(공백 제목, 오늘까지의 날짜, Storage 경로, 닉네임)도 서버에서 확인한다.
-- 앱이 표에 직접 하는 일은 읽기와 기록 지우기(파일을 먼저 지우고 행을 지운다, #11)뿐이라 둘은 남긴다.

-- 1. 두 저장 함수가 함께 쓰는 입력 확인. 화면(src/lib/dates/form.ts의 validateDraft)과 같은 규칙이다.
-- 공백은 화면의 JS trim()이 빼는 문자와 같게 둔다([:space:]는 NBSP·BOM을 공백으로 보지 않는다).
-- 다녀온 데이트를 남기므로 날짜·끝 날짜는 오늘(한국 날짜)까지이고, 제목은 공백만으로 둘 수 없다.
-- 값 제약(check)으로 두지 않는 이유: 오늘은 날마다 바뀌고, 백업 되살리기와 대시보드는 예전 값을 그대로 다뤄야 한다.
create function public.assert_date_record_fields(p_date date, p_end_date date, p_title text)
returns void
language plpgsql
stable
set search_path = ''
as $$
declare
  today date := (now() at time zone 'Asia/Seoul')::date;
begin
  if p_title is null or p_title !~ '[^[:space:]\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]' then
    raise exception '제목을 적어 주세요' using errcode = '22023';
  end if;
  if p_date > today or p_end_date > today then
    raise exception '날짜는 오늘(%)까지 고를 수 있습니다', today using errcode = '22023';
  end if;
end;
$$;

-- 저장 함수 안에서만 부른다(security definer 함수는 소유자 권한으로 부르므로 실행 권한이 필요 없다)
revoke execute on function public.assert_date_record_fields(date, date, text) from public, anon, authenticated;

-- 2. 저장 함수를 security definer로 바꾼다. 함수 밖에서는 표에 쓸 수 없으므로 회원 확인을 함수 안에서 한다.
-- 시그니처가 같아 create or replace로 바꾸고, 실행 권한은 그대로 남는다. 나머지 내용은 20261109010000·20261106050000과 같다.
create or replace function public.create_date_record(
  p_id uuid,
  p_date date,
  p_title text,
  p_place text,
  p_memo text,
  p_photos jsonb,
  p_cover_photo_id uuid,
  p_end_date date default null,
  p_tags text[] default null,
  p_place_location jsonb default null,
  p_event_id uuid default null,
  p_event_date date default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  photo_count int;
  violated text;
  linked_id uuid;
begin
  if not public.is_member() then
    raise exception '허용된 사용자만 기록을 남길 수 있습니다' using errcode = '42501';
  end if;

  perform public.assert_date_record_fields(p_date, p_end_date, p_title);

  photo_count := case when jsonb_typeof(p_photos) = 'array' then jsonb_array_length(p_photos) else 0 end;
  if photo_count not between 1 and 10 then
    raise exception '사진은 1장 이상 10장 이하로 올립니다: %장', photo_count using errcode = '22023';
  end if;

  if p_cover_photo_id is null or not exists (
    select 1 from jsonb_array_elements(p_photos) as photo where (photo ->> 'id')::uuid = p_cover_photo_id
  ) then
    raise exception '대표 사진은 올린 사진 중에서 고릅니다' using errcode = '22023';
  end if;

  -- 같은 id는 앞선 시도가 저장했다는 뜻이다(앱이 23505로 알아챈다, #157). 연결 중복(P0410)보다 먼저 알린다
  if exists (select 1 from public.dates where id = p_id) then
    raise exception '이미 저장된 기록입니다: %', p_id using errcode = '23505';
  end if;

  -- 작성 화면 주소는 손으로 바꿀 수 있고 쓰는 사이 일정이 지워질 수 있다. 없는 일정이면 연결 없이 남긴다
  if p_event_id is null or p_event_date is null or not exists (select 1 from public.events where id = p_event_id) then
    p_event_id := null;
    p_event_date := null;
  end if;

  begin
    insert into public.dates (id, date, end_date, title, place, memo, tags, place_lat, place_lng, event_id, event_date)
    values (
      p_id, p_date, p_end_date, p_title, nullif(btrim(p_place), ''), nullif(btrim(p_memo), ''), coalesce(p_tags, '{}'),
      (p_place_location ->> 'lat')::double precision, (p_place_location ->> 'lng')::double precision,
      p_event_id, p_event_date
    );
  exception when unique_violation then
    get stacked diagnostics violated = constraint_name;
    if violated is distinct from 'dates_event_link_key' then
      raise;
    end if;
    -- 그 일정의 그날에 이미 남긴 기록이 있다. 앱이 그 기록으로 안내하도록 id를 함께 알린다.
    -- 그사이 그 기록이 지워졌으면 빈 글자로 알린다(raise의 detail은 null을 받지 않는다)
    select id into linked_id from public.dates where event_id = p_event_id and event_date = p_event_date;
    raise exception '이 일정의 그날에는 이미 기록이 있습니다' using errcode = 'P0410', detail = coalesce(linked_id::text, '');
  end;

  -- 경로는 클라이언트가 보낸 값을 믿지 않고 업로드 규칙({기록 id}/{사진 id}.jpg)대로 만든다
  insert into public.photos (id, date_id, path, thumb_path, sort_order, caption)
  select
    (photo ->> 'id')::uuid,
    p_id,
    p_id || '/' || (photo ->> 'id') || '.jpg',
    p_id || '/' || (photo ->> 'id') || '_thumb.jpg',
    (position - 1)::int,
    nullif(btrim(photo ->> 'caption'), '')
  from jsonb_array_elements(p_photos) with ordinality as item (photo, position);

  update public.dates set cover_photo_id = p_cover_photo_id where id = p_id;

  return p_id;
end;
$$;

create or replace function public.update_date_record(
  p_id uuid,
  p_date date,
  p_title text,
  p_place text,
  p_memo text,
  p_photos jsonb,
  p_cover_photo_id uuid,
  p_end_date date default null,
  p_tags text[] default null,
  p_place_location jsonb default null,
  p_expected_revisions uuid[] default null,
  p_new_revision uuid default null
)
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  photo_count int;
  removed_paths text[];
begin
  if not public.is_member() then
    raise exception '허용된 사용자만 기록을 고칠 수 있습니다' using errcode = '42501';
  end if;

  perform public.assert_date_record_fields(p_date, p_end_date, p_title);

  photo_count := case when jsonb_typeof(p_photos) = 'array' then jsonb_array_length(p_photos) else 0 end;
  if photo_count not between 1 and 10 then
    raise exception '사진은 1장 이상 10장 이하로 올립니다: %장', photo_count using errcode = '22023';
  end if;

  if p_cover_photo_id is null or not exists (
    select 1 from jsonb_array_elements(p_photos) as photo where (photo ->> 'id')::uuid = p_cover_photo_id
  ) then
    raise exception '대표 사진은 올린 사진 중에서 고릅니다' using errcode = '22023';
  end if;

  -- 다른 기록의 사진 id를 넘기면 그 사진을 이 기록으로 끌어오거나 조용히 무시하게 되므로 막는다
  if exists (
    select 1
    from jsonb_array_elements(p_photos) as photo
    join public.photos as existing on existing.id = (photo ->> 'id')::uuid
    where existing.date_id <> p_id
  ) then
    raise exception '다른 기록의 사진은 넣을 수 없습니다' using errcode = '22023';
  end if;

  update public.dates
  set date = p_date, end_date = p_end_date, title = p_title, place = nullif(btrim(p_place), ''), memo = nullif(btrim(p_memo), ''),
    tags = coalesce(p_tags, tags),
    place_lat = case when p_place_location is null then place_lat else (p_place_location ->> 'lat')::double precision end,
    place_lng = case when p_place_location is null then place_lng else (p_place_location ->> 'lng')::double precision end,
    revision = coalesce(p_new_revision, gen_random_uuid())
  where id = p_id
    -- 화면을 연 뒤 다른 저장이 있었으면 고치지 않는다. 불러온 판과 내 앞선 시도의 판만 허용한다.
    -- 내 새 판도 허용해야 응답만 끊긴 요청을 그대로 다시 보낼 수 있다
    and (p_expected_revisions is null or revision = any(p_expected_revisions) or revision = p_new_revision);
  if not found then
    if exists (select 1 from public.dates where id = p_id) then
      raise exception '화면을 연 뒤 기록이 바뀌었습니다' using errcode = 'P0409';
    end if;
    raise exception '기록을 찾을 수 없습니다' using errcode = 'P0002';
  end if;

  with deleted as (
    delete from public.photos as existing
    where existing.date_id = p_id
      and existing.id not in (select (photo ->> 'id')::uuid from jsonb_array_elements(p_photos) as photo)
    returning existing.path, existing.thumb_path
  )
  select coalesce(array_agg(file_path), '{}') into removed_paths
  from deleted, unnest(array[deleted.path, deleted.thumb_path]) as file_path;

  -- 경로는 클라이언트가 보낸 값을 믿지 않고 업로드 규칙({기록 id}/{사진 id}.jpg)대로 만든다
  insert into public.photos (id, date_id, path, thumb_path, sort_order, caption)
  select
    (photo ->> 'id')::uuid,
    p_id,
    p_id || '/' || (photo ->> 'id') || '.jpg',
    p_id || '/' || (photo ->> 'id') || '_thumb.jpg',
    (position - 1)::int,
    nullif(btrim(photo ->> 'caption'), '')
  from jsonb_array_elements(p_photos) with ordinality as item (photo, position)
  on conflict (id) do update set sort_order = excluded.sort_order, caption = excluded.caption;

  update public.dates set cover_photo_id = p_cover_photo_id where id = p_id;

  return removed_paths;
end;
$$;

-- 3. 표에 직접 쓰는 권한을 거둔다. 사진 행은 저장 함수가 넣고 빼며, 기록을 지울 때는 외래 키(on delete cascade)가 함께 지운다.
-- 외래 키 동작은 표 소유자 권한으로 돌아 회원에게 사진 삭제 권한이 없어도 된다.
-- truncate·references·trigger는 Supabase 기본 권한이라 함께 거둔다(20261109000000의 comments와 같다).
revoke insert, update, truncate, references, trigger on table public.dates from authenticated;
revoke insert, update, delete, truncate, references, trigger on table public.photos from authenticated;

-- 권한이 없어 쓰이지 않는 정책은 지워, 정책만 보고 직접 쓸 수 있다고 오해하지 않게 한다
drop policy "dates_insert_members" on public.dates;
drop policy "dates_update_members" on public.dates;
drop policy "photos_insert_members" on public.photos;
drop policy "photos_update_members" on public.photos;
drop policy "photos_delete_members" on public.photos;

-- 4. album 버킷에는 앱이 만드는 경로로만 올린다(src/lib/photos/paths.ts). 기록 사진 {기록 id}/{사진 id}.jpg·_thumb.jpg와
-- 커플 사진 couple/{사진 id}.jpg·홈 카드용 _medium.jpg(id는 couple_photo.path 제약과 같이 소문자만)다.
-- 다른 경로는 기록과 이어지지 않아 정리되지 않는다. 기록 사진 경로의 id는 앱이 대소문자를 가리지 않고 받으므로 id만 같게 둔다.
drop policy "album_insert_members" on storage.objects;
create policy "album_insert_members" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'album'
    and (select public.is_member())
    and (
      name ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}(_thumb)?\.jpg$'
      or name ~ '^couple/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(_medium)?\.jpg$'
    )
  );

-- 앱은 덮어쓰지 않고(upsert: false) 옮기지도 않는다. 고치기를 열어 두면 다른 사진 파일의 내용을 바꿔치기할 수 있어 막는다
drop policy "album_update_members" on storage.objects;

-- 5. 닉네임: 화면에 아무것도 보이지 않는 이름과 일정 구분에 쓰는 '함께'를 서버에서도 막는다(src/lib/auth/nickname.ts).
-- 보이지 않는 문자는 화면 검사(Default_Ignorable_Code_Point, Cf)를 DB 정규식으로 다 옮길 수 없어 흔한 것만 둔다:
-- 공백, 소프트 하이픈, 한글 채움 문자, 폭 없는 문자·방향 표시, 이음 문자, 변형 선택자, BOM, 점자 빈칸.
-- 6자 제한은 화면에 보이는 글자 단위라 DB에서 셀 수 없어 지금처럼 폼이 맡는다(20261105000000).
drop policy "members_update_own_nickname" on public.members;
create policy "members_update_own_nickname" on public.members
  for update to authenticated
  using (id = (select auth.uid()))
  with check (
    id = (select auth.uid())
    and nickname !~ '^\s|\s$'
    and nickname <> '함께'
    and nickname ~ '[^[:space:]\u00ad\u034f\u115f\u1160\u180b-\u180f\u200b-\u200f\u202a-\u202e\u2060-\u206f\u3164\ufe00-\ufe0f\ufeff\uffa0\u2800]'
  );

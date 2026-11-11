-- 사진마다 위치와 찍은 시각을 남긴다(#249). 데이트 하루에 여러 곳을 가도 기록 장소 하나로는 한 곳만 지도에 남는다.
-- 위치는 이름과 좌표가 함께 있거나 함께 없다(이름 없는 핀, 좌표 없는 이름을 만들지 않는다). 기록 장소(dates.place)는 대표 장소로 그대로 둔다.
-- 찍은 시각은 사진 정보(EXIF)에서만 읽는다. 올린 파일에서는 사진 정보를 지우므로 고르는 순간에 남겨야 하고, 그 뒤로는 바꾸지 않는다.
-- 시간대 정보가 없는 시각은 앱이 한국 시각으로 보고 넘긴다(2026-11-11 사용자 결정).
alter table public.photos
  add column place text check (char_length(place) <= 100),
  add column place_lat double precision,
  add column place_lng double precision,
  add column taken_at timestamptz,
  add constraint photos_place_location_valid check (
    (place is null and place_lat is null and place_lng is null)
    or (
      place is not null and place_lat is not null and place_lng is not null
      and btrim(place) <> ''
      and place_lat between -90 and 90 and place_lng between -180 and 180
    )
  );

-- 사진 JSON의 위치는 {"place","lat","lng"}이고 null이면 위치가 없다. 이름 앞뒤 공백은 지우고,
-- 숫자가 아닌 좌표는 형변환 오류(22P02)로, 짝이 맞지 않거나 범위를 벗어난 값은 표 제약(23514)으로 거부된다.
-- 찍은 시각은 시간대를 함께 받는다. 시간대가 없으면 DB 세션 시간대(UTC)로 읽혀 몇 시간 어긋난 채 남으므로 거부한다(22023)

-- 두 저장 함수에 사진별 위치·찍은 시각을 더한다. 시그니처는 그대로라 create or replace로 바꾸고 실행 권한도 그대로 남는다.
-- 나머지 내용은 20261110010000과 같다. 사진 JSON의 새 키는 없어도 되어, 운영 DB에 먼저 적용해도 예전 코드가 그대로 동작한다.
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

  if exists (
    select 1 from jsonb_array_elements(p_photos) as photo
    where jsonb_typeof(photo -> 'taken_at') = 'string' and photo ->> 'taken_at' !~ '(Z|[+-][0-9]{2}(:?[0-9]{2})?)$'
  ) then
    raise exception '찍은 시각은 시간대와 함께 넘깁니다' using errcode = '22023';
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
  insert into public.photos (id, date_id, path, thumb_path, sort_order, caption, place, place_lat, place_lng, taken_at)
  select
    (photo ->> 'id')::uuid,
    p_id,
    p_id || '/' || (photo ->> 'id') || '.jpg',
    p_id || '/' || (photo ->> 'id') || '_thumb.jpg',
    (position - 1)::int,
    nullif(btrim(photo ->> 'caption'), ''),
    nullif(btrim(photo -> 'location' ->> 'place'), ''),
    (photo -> 'location' ->> 'lat')::double precision,
    (photo -> 'location' ->> 'lng')::double precision,
    (photo ->> 'taken_at')::timestamptz
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

  if exists (
    select 1 from jsonb_array_elements(p_photos) as photo
    where jsonb_typeof(photo -> 'taken_at') = 'string' and photo ->> 'taken_at' !~ '(Z|[+-][0-9]{2}(:?[0-9]{2})?)$'
  ) then
    raise exception '찍은 시각은 시간대와 함께 넘깁니다' using errcode = '22023';
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

  -- 이미 있는 사진의 위치는 location 키를 넘긴 사진만 바꾼다(null이면 지운다). 키가 없으면(예전 코드) 그대로 둔다.
  -- 새 사진은 아래 insert가 위치를 넣으므로, 넣기 전에 고쳐 이미 있던 사진만 고친다
  update public.photos as existing
  set
    place = nullif(btrim(photo -> 'location' ->> 'place'), ''),
    place_lat = (photo -> 'location' ->> 'lat')::double precision,
    place_lng = (photo -> 'location' ->> 'lng')::double precision
  from jsonb_array_elements(p_photos) as photo
  where existing.id = (photo ->> 'id')::uuid and existing.date_id = p_id and photo ? 'location';

  -- 경로는 클라이언트가 보낸 값을 믿지 않고 업로드 규칙({기록 id}/{사진 id}.jpg)대로 만든다.
  -- 찍은 시각은 새로 고른 사진에만 넣고, 이미 있는 사진은 바꾸지 않는다
  insert into public.photos (id, date_id, path, thumb_path, sort_order, caption, place, place_lat, place_lng, taken_at)
  select
    (photo ->> 'id')::uuid,
    p_id,
    p_id || '/' || (photo ->> 'id') || '.jpg',
    p_id || '/' || (photo ->> 'id') || '_thumb.jpg',
    (position - 1)::int,
    nullif(btrim(photo ->> 'caption'), ''),
    nullif(btrim(photo -> 'location' ->> 'place'), ''),
    (photo -> 'location' ->> 'lat')::double precision,
    (photo -> 'location' ->> 'lng')::double precision,
    (photo ->> 'taken_at')::timestamptz
  from jsonb_array_elements(p_photos) with ordinality as item (photo, position)
  on conflict (id) do update set sort_order = excluded.sort_order, caption = excluded.caption;

  update public.dates set cover_photo_id = p_cover_photo_id where id = p_id;

  return removed_paths;
end;
$$;

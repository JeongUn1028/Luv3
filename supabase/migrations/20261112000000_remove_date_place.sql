-- 기록 장소(dates.place·place_lat·place_lng)를 지운다(#296).
-- 카카오 로컬 API는 응답과 그 가공 데이터(장소 이름·좌표)를 저장해 쓰는 것을 허용하지 않는데, 기록 장소는 장소 찾기 결과를 담았다.
-- 화면은 앞 PR(#301)에서 칸을 없앴다. 지우는 값은 따로 보관하지 않는다(2026-11-12 사용자 결정).
-- 위치는 사진에만 남는다(photos.place 등, #249). 사진 모음 저장 구조(#297)가 모음 위치로 옮긴다.

-- 1. 찾기 함수는 돌려주는 칸이 바뀌어 create or replace로 바꿀 수 없으므로 지우고 다시 만든다(실행 권한도 다시 준다)
drop function public.search_date_records(text[], text, date, timestamptz, uuid, int);

-- 2. 칸을 지운다. 이름·좌표 짝 제약(dates_place_location_valid)은 칸과 함께 사라진다
alter table public.dates
  drop column place,
  drop column place_lat,
  drop column place_lng;

-- 3. 기록 찾기: 낱말은 제목·정리 글·사진 한마디·태그에서 찾는다. 나머지는 20261110050000과 같다
create function public.search_date_records(
  p_words text[] default '{}',
  p_tag text default null,
  p_before_date date default null,
  p_before_created_at timestamptz default null,
  p_before_id uuid default null,
  p_limit int default 60
)
returns table (
  id uuid,
  date date,
  end_date date,
  title text,
  tags text[],
  thumb_path text,
  created_at timestamptz,
  total_count bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  with matched as (
    select d.id, d.date, d.end_date, d.title, d.tags, d.created_at, d.cover_photo_id
    from public.dates as d
    where (p_tag is null or exists (select 1 from unnest(d.tags) as t(tag) where lower(t.tag) = lower(p_tag)))
      -- 낱말이 없으면(태그만 고르면) 찾을 글자를 만들지 않는다. 있으면 기록마다 한 번 만들어 낱말마다 비교한다
      and case when cardinality(coalesce(p_words, '{}')) = 0 then true else not exists (
        select 1
        from (
          select lower(concat_ws(
            e'\n',
            d.title,
            d.memo,
            (select string_agg(p.caption, e'\n') from public.photos as p where p.date_id = d.id),
            array_to_string(d.tags, e'\n')
          )) as body
        ) as searched
        cross join unnest(p_words) as w(word)
        where strpos(searched.body, lower(w.word)) = 0
      ) end
  )
  select m.id, m.date, m.end_date, m.title, m.tags, cover.thumb_path, m.created_at,
    case when p_before_date is null then (select count(*) from matched) end as total_count
  from matched as m
  left join public.photos as cover on cover.id = m.cover_photo_id
  where p_before_date is null
    or (m.date, m.created_at, m.id) < (p_before_date, p_before_created_at, p_before_id)
  order by m.date desc, m.created_at desc, m.id desc
  limit least(greatest(coalesce(p_limit, 60), 1), 100);
$$;

revoke execute on function public.search_date_records(text[], text, date, timestamptz, uuid, int) from public, anon;
grant execute on function public.search_date_records(text[], text, date, timestamptz, uuid, int) to authenticated;

-- 4. 기록 탭 판 값에서 장소를 뺀다. 시그니처가 같아 실행 권한은 그대로 남는다. 나머지는 20261110060000과 같다
create or replace function public.date_records_version()
returns text
language sql
stable
security invoker
set search_path = ''
as $$
  select md5(coalesce(string_agg(
    row(d.id, d.revision, d.date, d.end_date, d.title, d.tags, d.cover_photo_id)::text,
    e'\n' order by d.id
  ), ''))
  from public.dates as d;
$$;

-- 5. 두 저장 함수가 장소를 쓰지 않게 한다. p_place·p_place_location 인자는 남겨 두고 무시한다.
-- 시그니처를 바꾸면 모든 호출과 DB 테스트를 고쳐야 하는데, 바로 다음 #297이 사진 목록을 모음 목록으로 바꾸며 시그니처를 다시 바꾸므로 그때 함께 뺀다.
-- 시그니처가 같아 create or replace로 바꾸고 실행 권한도 그대로 남는다. 나머지 내용은 20261111000000과 같다
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
    insert into public.dates (id, date, end_date, title, memo, tags, event_id, event_date)
    values (p_id, p_date, p_end_date, p_title, nullif(btrim(p_memo), ''), coalesce(p_tags, '{}'), p_event_id, p_event_date);
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
  set date = p_date, end_date = p_end_date, title = p_title, memo = nullif(btrim(p_memo), ''),
    tags = coalesce(p_tags, tags),
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

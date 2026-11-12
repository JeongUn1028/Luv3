-- 모음마다 사용자가 직접 붙이는 장소 이름을 둔다(#317, 2026-11-12 사용자 결정).
-- 행정동 이름(place, 예: 성수1가1동)이 딱딱하고 가까운 두 곳이 같은 이름이 되기도 해서다. 사용자가 쓴 글이라 카카오 결과를 저장하지 않는다.
-- 비워 둘 수 있고, 비우면 앱이 행정동 이름을 다듬어(성수동) 보여 준다. 이미 저장된 모음은 빈 채로 시작한다.

-- 1. 모음 장소 이름. 기록 상세 사진 아래 한 줄에 들어가는 이름이라 30자까지다(앱의 글자 수 제한과 같다)
alter table public.photo_groups add column place_name text check (char_length(place_name) <= 30);

-- 2. 기록 찾기: 낱말을 모음 장소 이름에서도 찾는다. 돌려주는 칸이 같아 실행 권한은 그대로 남는다.
-- 나머지는 20261112020000과 같다
create or replace function public.search_date_records(
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
      -- 낱말은 제목·정리 글·모음 장소 이름·모음 한마디·태그에서 찾는다. 낱말이 없으면(태그만 고르면) 찾을 글자를 만들지 않는다. 있으면 기록마다 한 번 만들어 낱말마다 비교한다
      and case when cardinality(coalesce(p_words, '{}')) = 0 then true else not exists (
        select 1
        from (
          select lower(concat_ws(
            e'\n',
            d.title,
            d.memo,
            (select string_agg(concat_ws(e'\n', g.place_name, g.caption), e'\n') from public.photo_groups as g where g.date_id = d.id),
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

-- 3. 모음 검사: 장소 이름이 있으면 글자여야 한다. 시그니처가 같아 권한은 그대로 남는다. 나머지는 20261112020000과 같다
create or replace function public.assert_photo_groups(p_groups jsonb, p_cover_photo_id uuid)
returns void
language plpgsql
immutable
set search_path = ''
as $$
declare
  group_count int := case when jsonb_typeof(p_groups) = 'array' then jsonb_array_length(p_groups) else 0 end;
begin
  if group_count not between 1 and 10 then
    raise exception '사진 모음은 1개 이상 10개 이하로 올립니다: %개', group_count using errcode = '22023';
  end if;

  -- SQL은 or의 앞뒤를 정한 순서로 보지 않으므로, 배열이 아닐 때 길이를 재지 않게 case로 감싼다
  if exists (
    select 1 from jsonb_array_elements(p_groups) as grp
    where case when jsonb_typeof(grp -> 'photos') = 'array' then jsonb_array_length(grp -> 'photos') else 0 end not between 1 and 10
  ) then
    raise exception '모음마다 사진은 1장 이상 10장 이하로 올립니다' using errcode = '22023';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_groups) as grp
    where jsonb_typeof(grp -> 'location' -> 'place') is distinct from 'string'
      or btrim(grp -> 'location' ->> 'place') = ''
      or jsonb_typeof(grp -> 'location' -> 'lat') is distinct from 'number'
      or jsonb_typeof(grp -> 'location' -> 'lng') is distinct from 'number'
  ) then
    raise exception '모음마다 위치를 정합니다' using errcode = '22023';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_groups) as grp
    where jsonb_typeof(grp -> 'caption') not in ('string', 'null')
  ) then
    raise exception '모음 한마디는 글자로 넘깁니다' using errcode = '22023';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_groups) as grp
    where jsonb_typeof(grp -> 'place_name') not in ('string', 'null')
  ) then
    raise exception '모음 장소 이름은 글자로 넘깁니다' using errcode = '22023';
  end if;

  -- 빠지거나 겹친 id는 표의 기본 키 오류(23505)가 되는데, 작성 함수의 23505는 "이미 저장된 기록"이라는 뜻이라 먼저 막는다
  if (select count(distinct grp ->> 'id') <> count(*) from jsonb_array_elements(p_groups) as grp)
    or (select count(distinct photo ->> 'id') <> count(*) from public.flatten_photo_groups(p_groups))
  then
    raise exception '모음과 사진의 id는 빠지거나 겹칠 수 없습니다' using errcode = '22023';
  end if;

  if p_cover_photo_id is null or not exists (
    select 1 from public.flatten_photo_groups(p_groups) where (photo ->> 'id')::uuid = p_cover_photo_id
  ) then
    raise exception '대표 사진은 올린 사진 중에서 고릅니다' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.flatten_photo_groups(p_groups)
    where jsonb_typeof(photo -> 'taken_at') = 'string' and photo ->> 'taken_at' !~ '(Z|[+-][0-9]{2}(:?[0-9]{2})?)$'
  ) then
    raise exception '찍은 시각은 시간대와 함께 넘깁니다' using errcode = '22023';
  end if;
end;
$$;

-- 4. 두 저장 함수: 모음 JSON의 place_name을 모음에 저장한다. 빈 이름은 null로 저장하고, 30자를 넘으면 표 제약(23514)이 거부한다.
-- 모음 JSON은 [{"id", "location": {"place","lat","lng"}, "caption", "place_name", "photos": [{"id","taken_at"}]}]이다.
-- 고치기에서 place_name 키가 없으면(배포 직전의 예전 앱) 저장된 이름을 그대로 둔다.
-- 시그니처가 같아 실행 권한은 그대로 남는다. 나머지는 20261112020000과 같다
create or replace function public.create_date_record(
  p_id uuid,
  p_date date,
  p_title text,
  p_memo text,
  p_groups jsonb,
  p_cover_photo_id uuid,
  p_end_date date default null,
  p_tags text[] default null,
  p_event_id uuid default null,
  p_event_date date default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  violated text;
  linked_id uuid;
begin
  if not public.is_member() then
    raise exception '허용된 사용자만 기록을 남길 수 있습니다' using errcode = '42501';
  end if;

  perform public.assert_date_record_fields(p_date, p_end_date, p_title);
  perform public.assert_photo_groups(p_groups, p_cover_photo_id);

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

  -- 다른 기록의 모음 id를 넘기면 기본 키 오류(23505)가 나 "이미 저장된 기록"으로 오해되므로 미리 막는다
  if exists (
    select 1 from jsonb_array_elements(p_groups) as grp
    join public.photo_groups as existing on existing.id = (grp ->> 'id')::uuid
  ) then
    raise exception '다른 기록의 모음은 넣을 수 없습니다' using errcode = '22023';
  end if;

  insert into public.photo_groups (id, date_id, sort_order, place, place_lat, place_lng, caption, place_name)
  select
    (grp ->> 'id')::uuid,
    p_id,
    (position - 1)::int,
    btrim(grp -> 'location' ->> 'place'),
    (grp -> 'location' ->> 'lat')::double precision,
    (grp -> 'location' ->> 'lng')::double precision,
    nullif(btrim(grp ->> 'caption'), ''),
    nullif(btrim(grp ->> 'place_name'), '')
  from jsonb_array_elements(p_groups) with ordinality as item (grp, position);

  -- 경로는 클라이언트가 보낸 값을 믿지 않고 업로드 규칙({기록 id}/{사진 id}.jpg)대로 만든다
  insert into public.photos (id, date_id, group_id, path, thumb_path, sort_order, taken_at)
  select
    (photo ->> 'id')::uuid,
    p_id,
    group_id,
    p_id || '/' || (photo ->> 'id') || '.jpg',
    p_id || '/' || (photo ->> 'id') || '_thumb.jpg',
    sort_order,
    (photo ->> 'taken_at')::timestamptz
  from public.flatten_photo_groups(p_groups);

  update public.dates set cover_photo_id = p_cover_photo_id where id = p_id;

  return p_id;
end;
$$;

create or replace function public.update_date_record(
  p_id uuid,
  p_date date,
  p_title text,
  p_memo text,
  p_groups jsonb,
  p_cover_photo_id uuid,
  p_end_date date default null,
  p_tags text[] default null,
  p_expected_revisions uuid[] default null,
  p_new_revision uuid default null
)
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  removed_paths text[];
begin
  if not public.is_member() then
    raise exception '허용된 사용자만 기록을 고칠 수 있습니다' using errcode = '42501';
  end if;

  perform public.assert_date_record_fields(p_date, p_end_date, p_title);
  perform public.assert_photo_groups(p_groups, p_cover_photo_id);

  -- 다른 기록의 사진·모음 id를 넘기면 그것을 이 기록으로 끌어오거나 조용히 무시하게 되므로 막는다
  if exists (
    select 1
    from public.flatten_photo_groups(p_groups) as item
    join public.photos as existing on existing.id = (item.photo ->> 'id')::uuid
    where existing.date_id <> p_id
  ) then
    raise exception '다른 기록의 사진은 넣을 수 없습니다' using errcode = '22023';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_groups) as grp
    join public.photo_groups as existing on existing.id = (grp ->> 'id')::uuid
    where existing.date_id <> p_id
  ) then
    raise exception '다른 기록의 모음은 넣을 수 없습니다' using errcode = '22023';
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
      and existing.id not in (select (photo ->> 'id')::uuid from public.flatten_photo_groups(p_groups))
    returning existing.path, existing.thumb_path
  )
  select coalesce(array_agg(file_path), '{}') into removed_paths
  from deleted, unnest(array[deleted.path, deleted.thumb_path]) as file_path;

  -- 모음은 넘긴 순서·위치·한마디·장소 이름으로 넣거나 고친다. 다른 기록의 모음은 위에서 막았다.
  -- caption·place_name 키가 없으면 예전 앱이 보낸 것이라, 상대가 쓴 값을 지우지 않게 저장된 값을 그대로 쓴다
  insert into public.photo_groups (id, date_id, sort_order, place, place_lat, place_lng, caption, place_name)
  select
    (grp ->> 'id')::uuid,
    p_id,
    (position - 1)::int,
    btrim(grp -> 'location' ->> 'place'),
    (grp -> 'location' ->> 'lat')::double precision,
    (grp -> 'location' ->> 'lng')::double precision,
    case
      when grp ? 'caption' then nullif(btrim(grp ->> 'caption'), '')
      else (select existing.caption from public.photo_groups as existing where existing.id = (grp ->> 'id')::uuid)
    end,
    case
      when grp ? 'place_name' then nullif(btrim(grp ->> 'place_name'), '')
      else (select existing.place_name from public.photo_groups as existing where existing.id = (grp ->> 'id')::uuid)
    end
  from jsonb_array_elements(p_groups) with ordinality as item (grp, position)
  on conflict (id) do update
  set sort_order = excluded.sort_order, place = excluded.place, place_lat = excluded.place_lat, place_lng = excluded.place_lng,
    caption = excluded.caption, place_name = excluded.place_name;

  -- 경로는 클라이언트가 보낸 값을 믿지 않고 업로드 규칙({기록 id}/{사진 id}.jpg)대로 만든다.
  -- 찍은 시각은 새로 고른 사진에만 넣고, 이미 있는 사진은 바꾸지 않는다
  insert into public.photos (id, date_id, group_id, path, thumb_path, sort_order, taken_at)
  select
    (photo ->> 'id')::uuid,
    p_id,
    group_id,
    p_id || '/' || (photo ->> 'id') || '.jpg',
    p_id || '/' || (photo ->> 'id') || '_thumb.jpg',
    sort_order,
    (photo ->> 'taken_at')::timestamptz
  from public.flatten_photo_groups(p_groups)
  on conflict (id) do update set group_id = excluded.group_id, sort_order = excluded.sort_order;

  -- 넘기지 않은 모음을 지운다. 그 모음의 사진은 위에서 지웠거나 다른 모음으로 옮겼다
  delete from public.photo_groups as existing
  where existing.date_id = p_id
    and existing.id not in (select (grp ->> 'id')::uuid from jsonb_array_elements(p_groups) as grp);

  update public.dates set cover_photo_id = p_cover_photo_id where id = p_id;

  return removed_paths;
end;
$$;

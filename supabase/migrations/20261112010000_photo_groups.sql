-- 사진을 "모음" 단위로 묶고, 위치는 모음마다 하나로 둔다(#297, 2026-11-11 사용자 결정).
-- 한 번에 고른 사진(최대 10장)이 모음 하나이고 모음 하나가 장소 하나다. 기록당 모음은 최대 10개(사진 최대 100장)다.
-- 위치는 사진 정보(EXIF)와 행정동 경계(#290), 지도 가운데 핀으로만 정한다. 카카오 로컬 API 결과는 저장하지 않는다.
-- 찍은 시각(taken_at)과 한마디(caption)는 지금처럼 사진에 남긴다.

-- 1. 모음 표. 위치는 이름과 좌표가 늘 함께 있다(이름은 행정동 이름이거나, 찾지 못하면 앱의 "찍은 곳")
create table public.photo_groups (
  id uuid primary key,
  date_id uuid not null references public.dates (id) on delete cascade,
  sort_order int not null,
  place text not null check (btrim(place) <> '' and char_length(place) <= 100),
  place_lat double precision not null check (place_lat between -90 and 90),
  place_lng double precision not null check (place_lng between -180 and 180),
  created_at timestamptz not null default now(),
  -- 사진이 (모음, 기록) 짝으로 가리키게 해, 사진이 다른 기록의 모음에 들어가지 못하게 한다
  constraint photo_groups_id_date_id_key unique (id, date_id)
);

create index photo_groups_date_id_idx on public.photo_groups (date_id, sort_order);

-- 접근 권한은 사진 표와 같다. 회원은 읽기만 하고, 쓰기는 저장 함수가 하며 기록을 지우면 외래 키가 함께 지운다(20261110010000)
alter table public.photo_groups enable row level security;
revoke all on table public.photo_groups from anon;
revoke insert, update, delete, truncate, references, trigger on table public.photo_groups from authenticated;

create policy "photo_groups_select_members" on public.photo_groups
  for select to authenticated
  using ((select public.is_member()));

-- 2. 지금 사진을 옮긴다(2026-11-12 사용자 결정). 기록마다 사진 전체를 모음 하나로 묶고, 모음 위치는 위치가 있는 첫 사진 값으로 한다.
-- 위치 있는 사진이 하나도 없는 기록은 모음 위치를 정할 수 없으므로 옮기지 않고 멈춘다(사용자에게 물어 정한다)
do $$
begin
  if exists (
    select 1 from public.dates as d
    where exists (select 1 from public.photos as p where p.date_id = d.id)
      and not exists (select 1 from public.photos as p where p.date_id = d.id and p.place_lat is not null)
  ) then
    raise exception '위치가 있는 사진이 없는 기록이 있어 사진 모음으로 옮기지 않습니다';
  end if;
end;
$$;

alter table public.photos add column group_id uuid;

with first_located as (
  select distinct on (date_id) date_id, place, place_lat, place_lng
  from public.photos
  where place_lat is not null
  order by date_id, sort_order, id
), moved_groups as (
  insert into public.photo_groups (id, date_id, sort_order, place, place_lat, place_lng)
  select gen_random_uuid(), date_id, 0, place, place_lat, place_lng
  from first_located
  returning id, date_id
)
update public.photos as p
set group_id = moved_groups.id
from moved_groups
where moved_groups.date_id = p.date_id;

-- 3. 사진은 모음에 속한다. 사진별 위치 칸(#249)은 모음 위치로 옮겼으므로 지운다(이름·좌표 짝 제약도 함께 사라진다)
alter table public.photos
  alter column group_id set not null,
  add constraint photos_group_id_fkey foreign key (group_id, date_id) references public.photo_groups (id, date_id) on delete cascade,
  drop column place,
  drop column place_lat,
  drop column place_lng;

create index photos_group_id_idx on public.photos (group_id, date_id);

-- 4. 두 저장 함수가 함께 쓰는 모음 도우미. 저장 함수 안에서만 부른다(security definer 함수는 소유자 권한으로 부른다)

-- 모음 JSON을 사진 줄로 편다. 사진 순서(sort_order)는 기록 전체에서 모음 순서, 모음 안 순서대로 0부터 매겨,
-- 사진 순서로 읽는 화면(상세·대표 사진·사진 넘기기)이 모음 순서를 그대로 따른다
create function public.flatten_photo_groups(p_groups jsonb)
returns table (group_id uuid, photo jsonb, sort_order int)
language sql
immutable
set search_path = ''
as $$
  select
    (grp ->> 'id')::uuid,
    item.photo,
    (row_number() over (order by grp_item.position, item.position) - 1)::int
  from jsonb_array_elements(p_groups) with ordinality as grp_item (grp, position)
  cross join lateral jsonb_array_elements(grp_item.grp -> 'photos') with ordinality as item (photo, position);
$$;

revoke execute on function public.flatten_photo_groups(jsonb) from public, anon, authenticated;

-- 모음 JSON은 [{"id", "location": {"place","lat","lng"}, "photos": [{"id","caption","taken_at"}]}]이다.
-- 모음 1~10개, 모음마다 사진 1~10장, 모음마다 위치가 있어야 한다. 좌표 범위·이름 길이는 표 제약(23514)이 거부한다.
-- 찍은 시각은 시간대를 함께 받는다. 시간대가 없으면 DB 세션 시간대(UTC)로 읽혀 몇 시간 어긋난 채 남으므로 거부한다
create function public.assert_photo_groups(p_groups jsonb, p_cover_photo_id uuid)
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

revoke execute on function public.assert_photo_groups(jsonb, uuid) from public, anon, authenticated;

-- 5. 두 저장 함수가 사진 목록 대신 모음 목록을 받는다. 쓰지 않던 기록 장소 인자(p_place, p_place_location, #296)도 함께 뺀다.
-- 시그니처가 바뀌어 지우고 다시 만들고 실행 권한도 다시 준다. 나머지 내용은 20261112000000과 같다
drop function public.create_date_record(uuid, date, text, text, text, jsonb, uuid, date, text[], jsonb, uuid, date);
drop function public.update_date_record(uuid, date, text, text, text, jsonb, uuid, date, text[], jsonb, uuid[], uuid);

create function public.create_date_record(
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

  insert into public.photo_groups (id, date_id, sort_order, place, place_lat, place_lng)
  select
    (grp ->> 'id')::uuid,
    p_id,
    (position - 1)::int,
    btrim(grp -> 'location' ->> 'place'),
    (grp -> 'location' ->> 'lat')::double precision,
    (grp -> 'location' ->> 'lng')::double precision
  from jsonb_array_elements(p_groups) with ordinality as item (grp, position);

  -- 경로는 클라이언트가 보낸 값을 믿지 않고 업로드 규칙({기록 id}/{사진 id}.jpg)대로 만든다
  insert into public.photos (id, date_id, group_id, path, thumb_path, sort_order, caption, taken_at)
  select
    (photo ->> 'id')::uuid,
    p_id,
    group_id,
    p_id || '/' || (photo ->> 'id') || '.jpg',
    p_id || '/' || (photo ->> 'id') || '_thumb.jpg',
    sort_order,
    nullif(btrim(photo ->> 'caption'), ''),
    (photo ->> 'taken_at')::timestamptz
  from public.flatten_photo_groups(p_groups);

  update public.dates set cover_photo_id = p_cover_photo_id where id = p_id;

  return p_id;
end;
$$;

create function public.update_date_record(
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

  -- 모음은 넘긴 순서와 위치로 넣거나 고친다. 다른 기록의 모음은 위에서 막았다
  insert into public.photo_groups (id, date_id, sort_order, place, place_lat, place_lng)
  select
    (grp ->> 'id')::uuid,
    p_id,
    (position - 1)::int,
    btrim(grp -> 'location' ->> 'place'),
    (grp -> 'location' ->> 'lat')::double precision,
    (grp -> 'location' ->> 'lng')::double precision
  from jsonb_array_elements(p_groups) with ordinality as item (grp, position)
  on conflict (id) do update
  set sort_order = excluded.sort_order, place = excluded.place, place_lat = excluded.place_lat, place_lng = excluded.place_lng;

  -- 경로는 클라이언트가 보낸 값을 믿지 않고 업로드 규칙({기록 id}/{사진 id}.jpg)대로 만든다.
  -- 찍은 시각은 새로 고른 사진에만 넣고, 이미 있는 사진은 바꾸지 않는다
  insert into public.photos (id, date_id, group_id, path, thumb_path, sort_order, caption, taken_at)
  select
    (photo ->> 'id')::uuid,
    p_id,
    group_id,
    p_id || '/' || (photo ->> 'id') || '.jpg',
    p_id || '/' || (photo ->> 'id') || '_thumb.jpg',
    sort_order,
    nullif(btrim(photo ->> 'caption'), ''),
    (photo ->> 'taken_at')::timestamptz
  from public.flatten_photo_groups(p_groups)
  on conflict (id) do update set group_id = excluded.group_id, sort_order = excluded.sort_order, caption = excluded.caption;

  -- 넘기지 않은 모음을 지운다. 그 모음의 사진은 위에서 지웠거나 다른 모음으로 옮겼다
  delete from public.photo_groups as existing
  where existing.date_id = p_id
    and existing.id not in (select (grp ->> 'id')::uuid from jsonb_array_elements(p_groups) as grp);

  update public.dates set cover_photo_id = p_cover_photo_id where id = p_id;

  return removed_paths;
end;
$$;

revoke execute on function public.create_date_record(uuid, date, text, text, jsonb, uuid, date, text[], uuid, date) from public, anon;
grant execute on function public.create_date_record(uuid, date, text, text, jsonb, uuid, date, text[], uuid, date) to authenticated;
revoke execute on function public.update_date_record(uuid, date, text, text, jsonb, uuid, date, text[], uuid[], uuid) from public, anon;
grant execute on function public.update_date_record(uuid, date, text, text, jsonb, uuid, date, text[], uuid[], uuid) to authenticated;

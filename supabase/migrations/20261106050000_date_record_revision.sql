-- 오래된 수정 화면으로 저장하면 상대가 더한 사진이 지워지고 글이 되돌아갔다(#158).
-- 저장할 때마다 판 번호(revision)를 바꾸고, 화면을 연 뒤 바뀌었으면 저장을 거부한다.
-- 판 번호를 앱이 정하는 이유: 응답만 끊긴 저장을 다시 보낼 때 내 앞선 저장인지 상대의 저장인지 가려야 한다.
-- 저장 시도마다 새 판 번호를 쓴다. 내용이 바뀌면 판 번호도 바뀌어야 열어 둔 상대의 화면이 알아챈다.
alter table public.dates add column revision uuid not null default gen_random_uuid();

-- 시그니처가 바뀌어 그대로 두면 두 함수가 함께 남는다. 지우고 다시 만든다
drop function public.update_date_record(uuid, date, text, text, text, jsonb, uuid, date, text[], jsonb);

-- 예전 앱이 떠 있는 동안에도 저장되도록, 판 번호를 넘기지 않으면 지금처럼 확인 없이 고친다
create function public.update_date_record(
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
security invoker
set search_path = ''
as $$
declare
  photo_count int;
  removed_paths text[];
begin
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
    -- 없는 기록이거나 RLS로 보이지 않는 기록(허용목록 밖)
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

revoke execute on function public.update_date_record(uuid, date, text, text, text, jsonb, uuid, date, text[], jsonb, uuid[], uuid) from public, anon;
grant execute on function public.update_date_record(uuid, date, text, text, text, jsonb, uuid, date, text[], jsonb, uuid[], uuid) to authenticated;

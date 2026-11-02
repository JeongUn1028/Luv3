-- 기록 수정: 글·날짜·장소, 사진 목록(뺀 사진 삭제·새 사진 추가)·순서·한마디·대표 사진을 한 트랜잭션으로 바꾼다.
-- 중간에 실패하면 사진만 빠지거나 대표 사진이 비는 기록이 남으므로 함수 하나로 묶는다.
-- 뺀 사진의 원본·썸네일 경로를 돌려줘, 클라이언트가 저장이 끝난 뒤 Storage 파일을 지운다(DB 함수는 Storage를 지우지 못한다).
-- security invoker라 기존 RLS(허용목록이면 두 사람 모두 수정 가능)가 그대로 적용된다.
create function public.update_date_record(
  p_id uuid,
  p_date date,
  p_title text,
  p_place text,
  p_memo text,
  p_photos jsonb,
  p_cover_photo_id uuid
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
  set date = p_date, title = p_title, place = nullif(btrim(p_place), ''), memo = nullif(btrim(p_memo), '')
  where id = p_id;
  -- 없는 기록이거나 RLS로 보이지 않는 기록(허용목록 밖)
  if not found then
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

revoke execute on function public.update_date_record(uuid, date, text, text, text, jsonb, uuid) from public, anon;
grant execute on function public.update_date_record(uuid, date, text, text, text, jsonb, uuid) to authenticated;

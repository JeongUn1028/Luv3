-- 기록 작성: 기록 행 → 사진 행 → 대표 사진 지정을 한 트랜잭션으로 처리한다.
-- 대표 사진 FK(dates.cover_photo_id → photos.id) 때문에 세 번에 나눠 요청해야 하는데, 중간에 실패하면
-- 사진 없는 기록이나 대표 사진 없는 기록이 남는다. 함수 하나로 묶어 전부 저장하거나 아무것도 남기지 않는다.
-- security invoker라 기존 RLS(허용목록, 작성자 = 본인)가 그대로 적용된다.
create function public.create_date_record(
  p_id uuid,
  p_date date,
  p_title text,
  p_place text,
  p_memo text,
  p_photos jsonb,
  p_cover_photo_id uuid
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  photo_count int;
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

  insert into public.dates (id, date, title, place, memo)
  values (p_id, p_date, p_title, nullif(btrim(p_place), ''), nullif(btrim(p_memo), ''));

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

revoke execute on function public.create_date_record(uuid, date, text, text, text, jsonb, uuid) from public, anon;
grant execute on function public.create_date_record(uuid, date, text, text, text, jsonb, uuid) to authenticated;

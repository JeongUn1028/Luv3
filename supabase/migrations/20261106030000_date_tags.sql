-- 기록에 태그를 붙인다(#20). 기록 행의 배열 칸이라 RLS를 그대로 쓰고, 기존 기록은 태그 없이 남는다.
-- 글자 수와 개수는 폼(src/lib/dates/form.ts)과 같아야 한다.
-- check 제약은 넣는 사람의 권한으로 함수를 부르므로 로그인한 사용자와 서버 작업(service_role)에게 실행 권한을 준다.
create function public.are_valid_date_tags(p_tags text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select cardinality(p_tags) <= 5
    and cardinality(p_tags) = (select count(distinct tag) from unnest(p_tags) as tag)
    and not exists (
      select 1 from unnest(p_tags) as tag
      where tag is null or tag <> btrim(tag) or char_length(tag) not between 1 and 10
    );
$$;

revoke execute on function public.are_valid_date_tags(text[]) from public, anon;
grant execute on function public.are_valid_date_tags(text[]) to authenticated, service_role;

alter table public.dates
  add column tags text[] not null default '{}',
  add constraint dates_tags_valid check (public.are_valid_date_tags(tags));

-- 시그니처가 바뀌어 그대로 두면 두 함수가 함께 남는다. 지우고 다시 만들므로 실행 권한도 다시 준다.
drop function public.create_date_record(uuid, date, text, text, text, jsonb, uuid, date);
drop function public.update_date_record(uuid, date, text, text, text, jsonb, uuid, date);

-- p_tags는 맨 뒤에 기본값으로 둔다. 운영 DB에 먼저 적용한 뒤 새 코드가 배포될 때까지 예전 코드의 호출도 그대로 동작한다.
create function public.create_date_record(
  p_id uuid,
  p_date date,
  p_title text,
  p_place text,
  p_memo text,
  p_photos jsonb,
  p_cover_photo_id uuid,
  p_end_date date default null,
  p_tags text[] default null
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

  insert into public.dates (id, date, end_date, title, place, memo, tags)
  values (p_id, p_date, p_end_date, p_title, nullif(btrim(p_place), ''), nullif(btrim(p_memo), ''), coalesce(p_tags, '{}'));

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

revoke execute on function public.create_date_record(uuid, date, text, text, text, jsonb, uuid, date, text[]) from public, anon;
grant execute on function public.create_date_record(uuid, date, text, text, text, jsonb, uuid, date, text[]) to authenticated;

-- 예전 코드는 p_tags를 보내지 않으므로, 넘기지 않으면 있던 태그를 지우지 않고 그대로 둔다. 다 지울 때는 빈 배열을 보낸다.
create function public.update_date_record(
  p_id uuid,
  p_date date,
  p_title text,
  p_place text,
  p_memo text,
  p_photos jsonb,
  p_cover_photo_id uuid,
  p_end_date date default null,
  p_tags text[] default null
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
    tags = coalesce(p_tags, tags)
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

revoke execute on function public.update_date_record(uuid, date, text, text, text, jsonb, uuid, date, text[]) from public, anon;
grant execute on function public.update_date_record(uuid, date, text, text, text, jsonb, uuid, date, text[]) to authenticated;

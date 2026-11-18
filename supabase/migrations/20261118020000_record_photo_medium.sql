-- 기록 상세용 중간 크기 사진(#411). 상세 사진 칸(약 1,083px)에 긴 변 2000px 원본은 커서, 새로 올리는 사진은
-- 원본 옆 `{기록 id}/{사진 id}_medium.jpg`에 긴 변 1200px 사본을 함께 올린다. 경로는 커플 사진(#218)처럼 DB에 두지 않고
-- 원본 경로에서 정한다(src/lib/photos/paths.ts). 이미 올린 사진은 다시 만들지 않고 화면이 원본으로 대신한다.

-- 1. album 버킷에 기록 사진의 `_medium.jpg`도 올릴 수 있게 한다. 나머지 경로는 20261110010000과 같다
drop policy "album_insert_members" on storage.objects;
create policy "album_insert_members" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'album'
    and (select public.is_member())
    and (
      name ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}(_thumb|_medium)?\.jpg$'
      or name ~ '^couple/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(_medium)?\.jpg$'
    )
  );

-- 2. 기록이 쓰는 사진·휴지통 사진의 중간 크기도 회원이 지울 수 없게 한다(원본·썸네일과 같이, 20261112040000).
-- 중간 크기 경로는 표에 없으므로 `_medium.jpg`를 `.jpg`로 바꾼 원본 경로가 표에 있는지 본다.
-- `_medium`이 없는 이름은 바꿔도 그대로라 원본 경로 비교와 같다. 회원이 아니면 답하지 않는 것은 20261117010000과 같다
create or replace function public.is_kept_album_file(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case when public.is_member() then
    exists (
      select 1 from public.photos
      where path = p_name or thumb_path = p_name or path = regexp_replace(p_name, '_medium\.jpg$', '.jpg')
    )
    or exists (
      select 1 from public.photo_trash
      where path = p_name or thumb_path = p_name or path = regexp_replace(p_name, '_medium\.jpg$', '.jpg')
    )
  end;
$$;

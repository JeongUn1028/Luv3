-- 홈 맨 위의 커플 사진(#60). 두 사람이 같은 사진 한 장을 보므로 행은 하나만 둔다.
-- 파일은 album 버킷의 couple/{photo_id}.jpg에 두고, 이 행에는 지금 보여 줄 파일의 경로만 적는다(없으면 null).

create table public.couple_photo (
  -- 행을 하나로 고정하는 열. true 말고는 넣을 수 없어 두 번째 행이 생기지 않는다
  id boolean primary key default true check (id),
  path text check (
    path ~ '^couple/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$'
  ),
  updated_at timestamptz not null default now()
);

-- 바꾸기·지우기 함수가 이 행을 잠그고 예전 경로를 읽으므로, 처음부터 빈 행을 하나 넣어 둔다
insert into public.couple_photo (id) values (true);

alter table public.couple_photo enable row level security;

-- 비로그인(anon)은 정책 이전에 권한 단계에서 막는다.
-- 로그인 사용자도 읽기만 하고, 바꾸기·지우기는 아래 함수로만 한다(밀려난 파일 경로를 빠짐없이 돌려받아 지우게)
revoke all on table public.couple_photo from anon, authenticated;
grant select on table public.couple_photo to authenticated;

create policy "couple_photo_select_members" on public.couple_photo
  for select to authenticated
  using ((select public.is_member()));

-- 바꾸기·지우기가 함께 쓰는 내부 함수. 커플 사진 경로를 p_path(null이면 없음)로 바꾸고 바꾸기 전 경로를 돌려준다.
-- 두 사람이 동시에 바꿔도 각자 자기가 밀어낸 경로만 받도록 행을 잠그고 읽는다.
-- 같은 경로로 다시 부르면(응답이 끊겨 다시 보낸 경우) 지금 보여 주는 파일을 지우지 않게 null을 돌려준다.
create function public.swap_couple_photo_path(p_path text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  previous_path text;
begin
  if not public.is_member() then
    raise exception '허용된 사용자만 커플 사진을 바꿀 수 있습니다' using errcode = '42501';
  end if;

  select path into previous_path from public.couple_photo where id for update;

  insert into public.couple_photo (id, path, updated_at)
  values (true, p_path, now())
  on conflict (id) do update set path = excluded.path, updated_at = excluded.updated_at;

  if previous_path is not distinct from p_path then
    return null;
  end if;
  return previous_path;
end;
$$;

-- 클라이언트는 아래 두 함수로만 부른다
revoke execute on function public.swap_couple_photo_path(text) from public, anon, authenticated;

-- 커플 사진을 새로 올린 파일로 바꾼다. 돌려받은 예전 경로(없으면 null)의 파일은 호출한 쪽이 지운다
create function public.set_couple_photo(p_path text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_path is null then
    raise exception '사진 경로가 비었습니다. 지우기는 clear_couple_photo를 씁니다' using errcode = '22004';
  end if;
  return public.swap_couple_photo_path(p_path);
end;
$$;

revoke execute on function public.set_couple_photo(text) from public, anon;
grant execute on function public.set_couple_photo(text) to authenticated;

-- 커플 사진을 없앤다. 돌려받은 예전 경로(없으면 null)의 파일은 호출한 쪽이 지운다.
-- 생성 타입은 인자가 null을 받는지 드러내지 않아 지우기를 따로 둔다
create function public.clear_couple_photo()
returns text
language sql
security definer
set search_path = ''
as $$
  select public.swap_couple_photo_path(null);
$$;

revoke execute on function public.clear_couple_photo() from public, anon;
grant execute on function public.clear_couple_photo() to authenticated;

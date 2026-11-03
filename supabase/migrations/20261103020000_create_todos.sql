-- 하고 싶은 것(Todo) 목록. 둘이 함께 쓰는 하나의 목록이고, 두 사람 모두 서로가 적은 항목을 고치고 지울 수 있다.
-- 순서는 사용자가 직접 정한다(맨 위 3개가 홈에 나온다). 완료한 항목은 화면에서 아래로 내려가고, 완료를 풀면 원래 자리로 돌아온다.

-- 새 항목은 늘 목록 맨 아래에 붙는다. 시퀀스라 두 사람이 동시에 추가해도 순서 값이 겹치지 않는다
create sequence public.todos_sort_order_seq;

create table public.todos (
  id uuid primary key default gen_random_uuid(),
  content text not null check (char_length(content) between 1 and 100),
  -- 작을수록 위. 바꾸는 방법은 move_todo 하나뿐이다
  sort_order bigint not null default nextval('public.todos_sort_order_seq'),
  -- null이면 아직 하지 않은 항목
  completed_at timestamptz,
  author_id uuid not null default auth.uid() references public.members (id),
  created_at timestamptz not null default now()
);

alter sequence public.todos_sort_order_seq owned by public.todos.sort_order;

-- 순서 바꾸기는 완료하지 않은 항목만 순서대로 읽는다(완료한 항목이 쌓여도 훑지 않는다)
create index todos_open_sort_order_idx on public.todos (sort_order) where completed_at is null;

alter table public.todos enable row level security;

-- 비로그인(anon)은 정책 이전에 권한 단계에서 막는다
revoke all on table public.todos from anon;
revoke all on sequence public.todos_sort_order_seq from anon;
-- 추가할 때 기본값(nextval)을 쓰려면 시퀀스 사용 권한이 필요하다
grant usage on sequence public.todos_sort_order_seq to authenticated;

-- 추가할 때는 내용(과 id)만 적는다. 순서·완료·작성자·만든 시각은 기본값으로 정해, 맨 아래에 붙고 순서 값이 겹치지 않는다
revoke insert on table public.todos from authenticated;
grant insert (id, content) on table public.todos to authenticated;

-- 두 사람 모두 내용·완료를 고칠 수 있다. 작성자·만든 시각은 처음 값으로 고정하고,
-- 순서 값은 move_todo로만 바꿔 값이 겹치거나 엉뚱한 자리로 가지 않게 한다
revoke update on table public.todos from authenticated;
grant update (content, completed_at) on table public.todos to authenticated;

create policy "todos_select_members" on public.todos
  for select to authenticated
  using ((select public.is_member()));

create policy "todos_insert_members" on public.todos
  for insert to authenticated
  with check ((select public.is_member()) and author_id = (select auth.uid()));

create policy "todos_update_members" on public.todos
  for update to authenticated
  using ((select public.is_member()))
  with check ((select public.is_member()));

create policy "todos_delete_members" on public.todos
  for delete to authenticated
  using ((select public.is_member()));

-- 순서 바꾸기: 완료하지 않은 항목 중 바로 위(p_offset = -1) 또는 바로 아래(1) 항목과 자리를 바꾼다.
-- 위·아래 버튼 한 번이 한 칸이라, 화면 읽기 프로그램으로도 같은 방법으로 순서를 바꿀 수 있다.
-- 클라이언트가 순서 값을 직접 고치지 못하도록 security definer로 두고, 허용목록 확인은 함수 안에서 한다.
-- 맨 위에서 위로, 맨 아래에서 아래로 옮기면 아무것도 바꾸지 않는다.
create function public.move_todo(p_id uuid, p_offset int)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_order bigint;
  neighbor_id uuid;
  neighbor_order bigint;
begin
  if not public.is_member() then
    raise exception '허용된 사용자만 순서를 바꿀 수 있습니다' using errcode = '42501';
  end if;
  if p_offset is null or p_offset not in (-1, 1) then
    raise exception '한 번에 한 칸씩 옮깁니다: %', p_offset using errcode = '22023';
  end if;

  -- 두 사람이 동시에 옮겨도 같은 자리를 두 번 바꾸지 않도록, 완료하지 않은 항목을 잠그고 읽는다
  perform 1 from public.todos where completed_at is null order by sort_order for update;

  select sort_order into target_order from public.todos where id = p_id and completed_at is null;
  if not found then
    raise exception '옮길 항목을 찾을 수 없습니다(지웠거나 완료한 항목)' using errcode = 'P0002';
  end if;

  if p_offset < 0 then
    select id, sort_order into neighbor_id, neighbor_order
    from public.todos
    where completed_at is null and sort_order < target_order
    order by sort_order desc
    limit 1;
  else
    select id, sort_order into neighbor_id, neighbor_order
    from public.todos
    where completed_at is null and sort_order > target_order
    order by sort_order
    limit 1;
  end if;

  if neighbor_id is null then
    return;
  end if;

  update public.todos
  set sort_order = case when id = p_id then neighbor_order else target_order end
  where id in (p_id, neighbor_id);
end;
$$;

revoke execute on function public.move_todo(uuid, int) from public, anon;
grant execute on function public.move_todo(uuid, int) to authenticated;

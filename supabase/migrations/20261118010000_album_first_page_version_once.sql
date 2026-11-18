-- #411 1번 후속: 판 번호를 옆에 붙인 하위 질의는 데이터베이스가 풀어 합쳐서 줄마다 판 번호를 다시 계산했다.
-- 판 번호는 모든 기록을 훑으므로 기록 1,000개, 61줄이면 약 190ms가 든다. 줄 목록 안의 하위 질의로 두면 한 번만 계산한다(약 7ms)
create or replace function public.album_first_page(p_limit int)
returns table (id uuid, date date, end_date date, title text, tags text[], thumb_path text, created_at timestamptz, total_count bigint, records_version text)
language sql stable security invoker set search_path = ''
as $$
  select page.id, page.date, page.end_date, page.title, page.tags, page.thumb_path, page.created_at, page.total_count,
    (select public.date_records_version()) as records_version
  from public.search_date_records('{}', null, null, null, null, p_limit) as page
  order by page.date desc, page.created_at desc, page.id desc;
$$;

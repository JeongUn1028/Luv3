-- 기록 탭 첫 화면은 판 번호(date_records_version) → 첫 묶음(search_date_records) → 썸네일 서명을 차례로 불러 서버 왕복이 세 번이었다(#411 1번).
-- 판 번호와 첫 묶음을 한 문장에서 읽어 왕복을 하나 줄인다. 한 문장은 같은 순간의 기록을 보므로, 판 번호를 먼저 읽던 순서(#274)보다 두 값이 더 잘 맞는다.
-- 모든 줄에 같은 판 번호를 붙인다. 보이는 기록이 없으면 줄도 없다(앱은 판 번호를 첫 묶음끼리만 견주므로 정해 둔 값을 쓴다).
-- 부르는 사람의 권한으로 돌아(security invoker) 회원이 아니면 기록이 없는 것과 같다. 새 함수만 더해 예전 코드도 그대로 돈다.
-- 묶음 크기는 앱이 정한다(다음 묶음이 있는지 보려고 하나 더 받는다). 기본값을 두면 앱 값과 어긋날 수 있어 두지 않는다
create function public.album_first_page(p_limit int)
returns table (
  id uuid,
  date date,
  end_date date,
  title text,
  tags text[],
  thumb_path text,
  created_at timestamptz,
  total_count bigint,
  records_version text
)
language sql
stable
security invoker
set search_path = ''
as $$
  select page.id, page.date, page.end_date, page.title, page.tags, page.thumb_path, page.created_at, page.total_count, version.records_version
  from public.search_date_records('{}', null, null, null, null, p_limit) as page
  cross join (select public.date_records_version() as records_version) as version
  -- 함수 결과를 다른 것과 잇고 나면 줄 순서가 보장되지 않으므로 기록 찾기와 같은 순서로 다시 줄 세운다
  order by page.date desc, page.created_at desc, page.id desc;
$$;

revoke execute on function public.album_first_page(int) from public, anon;
grant execute on function public.album_first_page(int) to authenticated;

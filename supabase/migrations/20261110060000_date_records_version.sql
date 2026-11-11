-- 기록 탭은 기록을 60개씩 나눠 받는다(#274). 화면을 새로 받을 때 첫 묶음만 다시 오므로, 이어 받아 둔 기록이 아직 맞는지 알 수 없다.
-- 그래서 모든 기록의 그리드 칸 내용과 판 번호(revision)를 묶은 값 하나를 돌려준다. 이 값이 바뀌면 화면은 이어 받은 기록과 찾기 결과를 처음부터 다시 받는다.
-- 판 번호는 기록을 고칠 때마다 바뀌어 정리 글·사진 한마디처럼 칸에 안 보이는 내용(찾기에 쓰는 내용)이 바뀐 것도 알린다.
-- row(...)::text는 빈 칸(null)도 표시해 앞뒤 칸과 섞이지 않는다. 기록이 없으면 md5('')다.
-- 부르는 사람의 권한으로 돌아(security invoker) 회원이 아니면 기록이 없는 것과 같은 값이 나온다.
create function public.date_records_version()
returns text
language sql
stable
security invoker
set search_path = ''
as $$
  select md5(coalesce(string_agg(
    row(d.id, d.revision, d.date, d.end_date, d.title, d.place, d.tags, d.cover_photo_id)::text,
    e'\n' order by d.id
  ), ''))
  from public.dates as d;
$$;

revoke execute on function public.date_records_version() from public, anon;
grant execute on function public.date_records_version() to authenticated;

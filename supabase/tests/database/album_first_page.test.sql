-- 기록 탭 첫 묶음(#411 1번): 판 번호와 첫 묶음을 한 번에 읽고, 둘이 같은 순간의 값인지, 회원만 읽는지 확인한다.
-- 로컬 DB에 다른 기록이 남아 있어도 흔들리지 않게, 같은 트랜잭션 안에서 따로 부른 두 함수의 결과와 비교한다.
begin;
create extension if not exists pgtap with schema extensions;

select plan(6);

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-00000000000a', 'a@first-page.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000ff', 'outsider@first-page.test', 'authenticated', 'authenticated');

insert into public.members (id, email, nickname) values
  ('00000000-0000-0000-0000-00000000000a', 'a@first-page.test', 'A');

insert into public.dates (id, date, title, tags, author_id) values
  ('73000000-0000-0000-0000-000000000001', '2999-12-31', 'pgf첫째', array['pgf'], '00000000-0000-0000-0000-00000000000a'),
  ('73000000-0000-0000-0000-000000000002', '2999-12-30', 'pgf둘째', '{}', '00000000-0000-0000-0000-00000000000a');

select has_function('public', 'album_first_page', array['integer'], '기록 탭 첫 묶음 함수가 있다');
select ok(
  not has_function_privilege('anon', 'public.album_first_page(integer)', 'execute'),
  '비로그인은 기록 탭 첫 묶음을 읽을 수 없다'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);

select results_eq(
  'select id, date, end_date, title, tags, thumb_path, created_at, total_count from public.album_first_page(3)',
  $$select * from public.search_date_records('{}', null, null, null, null, 3)$$,
  '첫 묶음은 조건 없는 기록 찾기의 첫 묶음과 같다'
);
select is(
  (select array_agg(distinct records_version) from public.album_first_page(3)),
  array[public.date_records_version()],
  '모든 줄에 같은 판 번호를 붙이고, 따로 읽은 판 번호와 같다'
);
select is(
  (select array_agg(id) from public.album_first_page(2)),
  array['73000000-0000-0000-0000-000000000001', '73000000-0000-0000-0000-000000000002']::uuid[],
  '최신 기록부터 줄 세워 묶음 크기만큼 준다'
);

-- 허용목록 밖이면 기록이 없는 것과 같다
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000ff","role":"authenticated"}', true);
select is_empty('select * from public.album_first_page(3)', '허용목록 밖이면 첫 묶음이 비어 있다');

select * from finish();
rollback;

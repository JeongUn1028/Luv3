-- 서버 기록 찾기(#273): 검색어·태그로 찾기, 최신순 나눠 받기, 전체 수, 태그 세기, 권한을 확인한다.
-- 로컬 DB에 다른 기록이 남아 있어도 흔들리지 않게, 여기서 만든 기록에만 있는 낱말·태그로 찾는다.
begin;
create extension if not exists pgtap with schema extensions;

select plan(16);

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-00000000000a', 'a@search.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000ff', 'outsider@search.test', 'authenticated', 'authenticated');

insert into public.members (id, email, nickname) values
  ('00000000-0000-0000-0000-00000000000a', 'a@search.test', 'A');

-- 기록 넷: 낱말이 제목·장소·정리 글·사진 한마디·태그에 하나씩 있다. 같은 날의 둘은 작성 시각으로 줄 선다
insert into public.dates (id, date, title, place, memo, tags, author_id, created_at) values
  ('70000000-0000-0000-0000-000000000001', '2026-11-03', 'pgs제목 Han River', null, null, array['pgs태그A'], '00000000-0000-0000-0000-00000000000a', '2026-11-03 10:00+09'),
  ('70000000-0000-0000-0000-000000000002', '2026-11-03', '둘째', 'pgs장소', 'pgs정리 100%_할인', array['PGS태그a', '여행'], '00000000-0000-0000-0000-00000000000a', '2026-11-03 12:00+09'),
  ('70000000-0000-0000-0000-000000000003', '2026-11-02', '셋째', null, null, array['pgs태그a'], '00000000-0000-0000-0000-00000000000a', '2026-11-02 10:00+09'),
  ('70000000-0000-0000-0000-000000000004', '2026-11-01', '넷째', null, 'pgs정리 1000원', array['pgs태그B'], '00000000-0000-0000-0000-00000000000a', '2026-11-01 10:00+09');

insert into public.photos (id, date_id, path, thumb_path, caption) values
  ('71000000-0000-0000-0000-000000000003', '70000000-0000-0000-0000-000000000003', 'a/3.jpg', 'a/3_thumb.jpg', 'pgs한마디'),
  ('71000000-0000-0000-0000-000000000004', '70000000-0000-0000-0000-000000000004', 'a/4.jpg', 'a/4_thumb.jpg', null);
update public.dates set cover_photo_id = '71000000-0000-0000-0000-000000000003' where id = '70000000-0000-0000-0000-000000000003';

-- 1000개가 넘는 기록: 응답 한도(1000행)와 상관없이 전체 수와 태그 수가 맞아야 한다
insert into public.dates (date, title, tags, author_id)
select date '2025-01-01' + (n % 300), 'pgs천건 ' || n, array['pgs천건'], '00000000-0000-0000-0000-00000000000a'
from generate_series(1, 1050) as n;

select has_function(
  'public', 'search_date_records', array['text[]', 'text', 'date', 'timestamp with time zone', 'uuid', 'integer'],
  '기록 찾기 함수가 있다'
);
select ok(
  not has_function_privilege('anon', 'public.search_date_records(text[], text, date, timestamptz, uuid, int)', 'execute')
    and not has_function_privilege('anon', 'public.count_date_tags()', 'execute'),
  '비로그인은 찾기·태그 세기 함수를 실행할 수 없다'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);

select is(
  (select array_agg(id order by id) from public.search_date_records(array['pgs제목'])),
  array['70000000-0000-0000-0000-000000000001'::uuid],
  '제목에 든 낱말로 찾는다'
);
select is(
  (select array_agg(id order by id) from public.search_date_records(array['PGS장소'])),
  array['70000000-0000-0000-0000-000000000002'::uuid],
  '장소에 든 낱말로 대소문자 없이 찾는다'
);
select is(
  (select array_agg(id order by id) from public.search_date_records(array['pgs한마디'])),
  array['70000000-0000-0000-0000-000000000003'::uuid],
  '사진 한마디에 든 낱말로 찾는다'
);
select is(
  (select array_agg(id order by date desc, created_at desc) from public.search_date_records(array['pgs정리'])),
  array['70000000-0000-0000-0000-000000000002', '70000000-0000-0000-0000-000000000004']::uuid[],
  '정리 글에 든 낱말로 찾는다'
);
select is(
  (select array_agg(id order by id) from public.search_date_records(array['pgs태그b'])),
  array['70000000-0000-0000-0000-000000000004'::uuid],
  '태그에 든 낱말로 찾는다'
);
select is(
  (select array_agg(id order by id) from public.search_date_records(array['pgs정리', '1000원'])),
  array['70000000-0000-0000-0000-000000000004'::uuid],
  '띄어 쓴 낱말은 모두 들어 있어야 한다'
);
select is(
  (select array_agg(id order by id) from public.search_date_records(array['pgs', '0%_'])),
  array['70000000-0000-0000-0000-000000000002'::uuid],
  '% 와 _ 는 글자 그대로 찾는다'
);
select is(
  (select array_agg(id) from public.search_date_records('{}', 'pgs태그a')),
  array['70000000-0000-0000-0000-000000000002', '70000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000003']::uuid[],
  '태그는 대소문자 없이 같은 것만 최신순(날짜 → 작성 시각)으로 고른다'
);
select is(
  (select array_agg(id) from public.search_date_records(array['pgs정리'], 'PGS태그A')),
  array['70000000-0000-0000-0000-000000000002'::uuid],
  '검색어와 태그를 함께 쓰면 둘 다 맞아야 한다'
);
select is(
  (select array_agg(thumb_path) from public.search_date_records('{}', 'pgs태그a', p_limit => 1, p_before_date => '2026-11-03', p_before_created_at => '2026-11-03 10:00+09', p_before_id => '70000000-0000-0000-0000-000000000001')),
  array['a/3_thumb.jpg'],
  '앞 묶음 마지막 기록 다음부터 받고, 대표 사진의 썸네일 경로를 붙인다'
);
select is(
  (select array_agg(distinct total_count) from public.search_date_records('{}', 'pgs태그a', p_limit => 1)),
  array[3::bigint],
  '전체 수는 묶음 크기와 상관없이 맞는 기록 전체의 수다'
);

select is(
  (select (count(*), max(total_count))::text from public.search_date_records(array['pgs천건'], p_limit => 1000)),
  '(100,1050)',
  '1000개가 넘어도 전체 수를 세고, 한 번에는 100개까지만 준다'
);

select is(
  (select array_agg((lower(tag), count)::text order by lower(tag)) from public.count_date_tags() where lower(tag) like 'pgs%'),
  array['(pgs천건,1050)', '(pgs태그a,3)', '(pgs태그b,1)'],
  '태그를 대소문자 없이 묶어 1000개가 넘어도 끝까지 센다'
);

-- 허용목록 밖의 사용자
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000ff","role":"authenticated"}', true);

select is(
  (select count(*) from public.search_date_records('{}')) + (select count(*) from public.count_date_tags()),
  0::bigint,
  '허용목록 밖이면 찾아도 기록과 태그가 하나도 나오지 않는다'
);

select * from finish();
rollback;

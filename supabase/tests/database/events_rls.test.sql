-- 공유 캘린더 일정(events): 허용된 두 사람은 서로의 일정을 보고 고치고 지울 수 있고,
-- 비로그인·허용목록 밖 사용자는 읽지도 쓰지도 못하는지 확인한다.
begin;
create extension if not exists pgtap with schema extensions;

select plan(14);

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-00000000000a', 'a@events.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000000b', 'b@events.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000ff', 'outsider@events.test', 'authenticated', 'authenticated');

insert into public.members (id, email, nickname) values
  ('00000000-0000-0000-0000-00000000000a', 'a@events.test', 'A'),
  ('00000000-0000-0000-0000-00000000000b', 'b@events.test', 'B');

select has_table('public', 'events', '일정 테이블이 있다');

-- 비로그인(anon)
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select throws_ok('select * from public.events', '42501', null, '비로그인이면 일정을 조회할 권한이 없다');

-- a가 종일 일정과 시간 일정을 만든다
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);

select lives_ok(
  $$insert into public.events (id, date, start_time, title, place) values
      ('30000000-0000-0000-0000-000000000001', '2026-11-14', null, '전시 보기', '국립현대미술관'),
      ('30000000-0000-0000-0000-000000000002', '2026-11-14', '19:30', '저녁', null)$$,
  '허용된 사용자는 일정을 만든다(시간이 없으면 종일)'
);

select results_eq(
  $$select author_id from public.events where id = '30000000-0000-0000-0000-000000000001'$$,
  $$values ('00000000-0000-0000-0000-00000000000a'::uuid)$$,
  '작성자는 로그인한 사용자로 자동 기록된다'
);

select throws_ok(
  $$insert into public.events (date, title, author_id)
    values ('2026-11-15', '남의 이름으로', '00000000-0000-0000-0000-00000000000b')$$,
  '42501',
  null,
  '다른 사람을 작성자로 적을 수 없다'
);

select throws_ok(
  $$insert into public.events (date, title) values ('2026-11-15', '')$$,
  '23514',
  null,
  '빈 제목은 저장하지 않는다'
);

-- 다른 멤버 b
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);

select results_eq(
  $$select count(*)::int from public.events where id::text like '30000000-%'$$,
  $$values (2)$$,
  '다른 멤버도 상대가 만든 일정을 본다'
);

select throws_ok(
  $$update public.events set author_id = '00000000-0000-0000-0000-00000000000b'
    where id = '30000000-0000-0000-0000-000000000001'$$,
  '42501',
  null,
  '고칠 때 작성자는 바꿀 수 없다'
);

select lives_ok(
  $$update public.events set title = '전시 보기(시간 변경)', start_time = '14:00'
    where id = '30000000-0000-0000-0000-000000000001'$$,
  '다른 멤버도 일정을 고친다'
);

select results_eq(
  $$select title, start_time from public.events where id = '30000000-0000-0000-0000-000000000001'$$,
  $$values ('전시 보기(시간 변경)', '14:00'::time)$$,
  '고친 내용이 저장된다'
);

select lives_ok(
  $$delete from public.events where id = '30000000-0000-0000-0000-000000000002'$$,
  '다른 멤버도 일정을 지운다'
);

-- 허용목록 밖 사용자
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000ff","role":"authenticated"}', true);

select is_empty('select * from public.events', '허용목록 밖 사용자에게는 일정이 보이지 않는다');

select throws_ok(
  $$insert into public.events (date, title) values ('2026-11-20', '침입')$$,
  '42501',
  null,
  '허용목록 밖 사용자는 일정을 만들지 못한다'
);

select results_eq(
  $$with changed as (
      update public.events set title = '침입' where id = '30000000-0000-0000-0000-000000000001' returning 1
    ) select count(*)::int from changed$$,
  $$values (0)$$,
  '허용목록 밖 사용자는 일정을 고치지 못한다'
);

select * from finish();
rollback;

-- 반복 일정(#27): 규칙 제약, 건너뛰는 날 권한, 하루만 고치기, 반복 전체 지우기를 확인한다.
begin;
create extension if not exists pgtap with schema extensions;

select plan(22);

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-00000000000a', 'a@repeat.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000000b', 'b@repeat.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000ff', 'outsider@repeat.test', 'authenticated', 'authenticated');

insert into public.members (id, email, nickname) values
  ('00000000-0000-0000-0000-00000000000a', 'a@repeat.test', 'A'),
  ('00000000-0000-0000-0000-00000000000b', 'b@repeat.test', 'B');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);

select lives_ok(
  $$insert into public.events (id, date, title, is_together, repeat_rule, repeat_until) values
      ('40000000-0000-0000-0000-000000000001', '2026-11-06', '수영', false, 'weekly', '2026-12-31'),
      ('40000000-0000-0000-0000-000000000002', '2026-11-06', '한 번', true, null, null)$$,
  '반복 일정과 한 번짜리 일정을 만든다'
);

select throws_ok(
  $$insert into public.events (date, title, repeat_rule) values ('2026-11-06', '격주', 'biweekly')$$,
  '23514', null, '정해진 반복 규칙만 저장한다'
);

select throws_ok(
  $$insert into public.events (date, title, repeat_rule, repeat_until) values ('2026-11-06', '어제까지', 'weekly', '2026-11-06')$$,
  '23514', null, '끝나는 날은 시작일 뒤여야 한다'
);

select throws_ok(
  $$insert into public.events (date, title, repeat_until) values ('2026-11-06', '규칙 없음', '2026-12-01')$$,
  '23514', null, '반복하지 않는 일정에는 끝나는 날을 둘 수 없다'
);

-- b도 반복 규칙을 고칠 수 있지만 원래 반복은 바꾸지 못한다
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);

select lives_ok(
  $$update public.events set repeat_rule = 'monthly', repeat_until = null where id = '40000000-0000-0000-0000-000000000001'$$,
  '두 사람 모두 반복 규칙을 고친다'
);

select throws_ok(
  $$update public.events set repeat_parent_id = '40000000-0000-0000-0000-000000000001' where id = '40000000-0000-0000-0000-000000000002'$$,
  '42501', null, '따로 나온 일정의 원래 반복은 앱에서 바꿀 수 없다'
);

-- 따로 나온 일정은 함수로만 만든다. b가 넣으므로 작성자는 b다
select throws_ok(
  $$insert into public.events (date, title, author_id, repeat_parent_id) values ('2026-11-06', '직접', '00000000-0000-0000-0000-00000000000b', '40000000-0000-0000-0000-000000000002')$$,
  '42501', null, '원래 반복을 직접 지정해 일정을 넣을 수 없다'
);

-- 건너뛰는 날
select lives_ok(
  $$insert into public.event_exceptions (event_id, date) values ('40000000-0000-0000-0000-000000000001', '2026-12-06')$$,
  '두 사람 모두 하루를 건너뛴다'
);

select throws_ok(
  $$insert into public.event_exceptions (event_id, date) values ('40000000-0000-0000-0000-000000000002', '2026-11-06')$$,
  '42501', null, '반복하지 않는 일정에는 건너뛰는 날을 넣을 수 없다'
);

-- 하루만 고치기: b가 a의 일정을 고쳐도 작성자와 함께 여부는 반복 일정을 따른다
select lives_ok(
  $$select public.detach_event_occurrence('40000000-0000-0000-0000-000000000001', '2027-01-06', '2027-01-07', '수영(옮김)', '19:00', '수영장', null)$$,
  '하루만 고치면 일정이 따로 나온다'
);

select results_eq(
  $$select date, title, is_together, author_id, repeat_rule, repeat_parent_id from public.events where title = '수영(옮김)'$$,
  $$values ('2027-01-07'::date, '수영(옮김)'::text, false, '00000000-0000-0000-0000-00000000000a'::uuid, null::text, '40000000-0000-0000-0000-000000000001'::uuid)$$,
  '따로 나온 일정은 작성자와 함께 여부를 물려받고 반복하지 않는다'
);

select results_eq(
  $$select count(*)::int from public.event_exceptions where event_id = '40000000-0000-0000-0000-000000000001' and date = '2027-01-06'$$,
  $$values (1)$$,
  '하루만 고친 날은 반복에서 건너뛴다'
);

select lives_ok(
  $$select public.detach_event_occurrence('40000000-0000-0000-0000-000000000001', '2027-01-13', '2027-01-13', '종일로')$$,
  '날짜와 제목만 넘겨도 하루만 고친다'
);

select results_eq(
  $$select start_time, place, memo from public.events where title = '종일로'$$,
  $$values (null::time, null::text, null::text)$$,
  '시간·장소·메모를 넘기지 않으면 비워 둔다'
);

-- 응답을 못 받아 다시 저장하거나 둘이 같은 날을 고쳐도 일정이 두 줄 생기지 않는다
select throws_ok(
  $$select public.detach_event_occurrence('40000000-0000-0000-0000-000000000001', '2027-01-06', '2027-01-07', '수영(옮김)', '19:00', '수영장', null)$$,
  'P0002', null, '이미 건너뛴 날은 다시 고칠 수 없다'
);

select results_eq(
  $$select count(*)::int from public.events where title = '수영(옮김)'$$,
  $$values (1)$$,
  '같은 날을 두 번 고쳐도 일정은 하나다'
);

select throws_ok(
  $$select public.detach_event_occurrence('40000000-0000-0000-0000-000000000002', '2026-11-06', '2026-11-07', '한 번')$$,
  'P0002', null, '반복 일정이 아니면 하루만 고칠 수 없다'
);

-- 허용목록 밖
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000ff","role":"authenticated"}', true);

select results_eq(
  $$select count(*)::int from public.event_exceptions$$,
  $$values (0)$$,
  '허용목록 밖 사용자는 건너뛰는 날을 볼 수 없다'
);

select throws_ok(
  $$select public.detach_event_occurrence('40000000-0000-0000-0000-000000000001', '2027-02-06', '2027-02-06', '침입')$$,
  '42501', null, '허용목록 밖 사용자는 하루만 고칠 수 없다'
);

-- 비로그인
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select throws_ok(
  $$select * from public.event_exceptions$$,
  '42501', null, '비로그인이면 건너뛰는 날을 조회할 권한이 없다'
);

-- 반복 전체 지우기
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);

delete from public.events where id = '40000000-0000-0000-0000-000000000001';

select results_eq(
  $$select count(*)::int from public.events where title = '수영(옮김)'$$,
  $$values (0)$$,
  '반복 전체를 지우면 따로 나온 일정도 지워진다'
);

select results_eq(
  $$select count(*)::int from public.event_exceptions$$,
  $$values (0)$$,
  '반복 전체를 지우면 건너뛰는 날도 지워진다'
);

select * from finish();
rollback;

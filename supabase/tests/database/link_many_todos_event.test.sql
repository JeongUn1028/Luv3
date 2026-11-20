-- 일정 하나에 하고 싶은 것 여러 개 잇기(#495): set_event_todos(여러 개 잇기·끊기, 다시 보내도 같은 결과, P0409·P0412·P0002, 반복 일정 거부),
-- schedule_todos(여럿에 새 일정 잡기, 다시 보내기, 그사이 연결이 바뀌면 거부), 예전 앱의 하나짜리 함수가 다른 연결을 지우지 않는지,
-- 기록을 남기면 이어진 것이 모두 완료되는지 확인한다.
begin;
create extension if not exists pgtap with schema extensions;

select plan(30);

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-00000000000a', 'a@link-many.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000000b', 'outsider@link-many.test', 'authenticated', 'authenticated');

insert into public.members (id, email, nickname) values
  ('00000000-0000-0000-0000-00000000000a', 'a@link-many.test', 'A');

-- 테스트 데이터는 RLS를 거치지 않고 미리 넣는다
insert into public.events (id, date, title, is_together, author_id, repeat_rule) values
  ('50000000-0000-0000-0000-000000000001', '2026-11-28', '부산 여행', true, '00000000-0000-0000-0000-00000000000a', null),
  ('50000000-0000-0000-0000-000000000002', '2026-11-29', '다른 일정', true, '00000000-0000-0000-0000-00000000000a', null),
  ('50000000-0000-0000-0000-000000000003', '2026-11-30', '매주 산책', true, '00000000-0000-0000-0000-00000000000a', 'weekly');
insert into public.todos (id, content, author_id) values
  ('40000000-0000-0000-0000-000000000001', '회 먹기', '00000000-0000-0000-0000-00000000000a'),
  ('40000000-0000-0000-0000-000000000002', '요트 타기', '00000000-0000-0000-0000-00000000000a'),
  ('40000000-0000-0000-0000-000000000003', '사진관', '00000000-0000-0000-0000-00000000000a'),
  ('40000000-0000-0000-0000-000000000004', '한강 라면', '00000000-0000-0000-0000-00000000000a'),
  ('40000000-0000-0000-0000-000000000005', '전시 보기', '00000000-0000-0000-0000-00000000000a'),
  ('40000000-0000-0000-0000-000000000006', '케이크 만들기', '00000000-0000-0000-0000-00000000000a');

select has_function('public', 'set_event_todos', array['uuid', 'uuid[]', 'uuid[]'], '일정의 하고 싶은 것 목록을 바꾸는 함수가 있다');
select has_function(
  'public', 'schedule_todos', array['uuid[]', 'uuid', 'uuid', 'date', 'text', 'boolean', 'time without time zone', 'date', 'text', 'text', 'uuid[]'],
  '하고 싶은 것 여럿에 새 일정을 잡는 함수가 있다'
);

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok(
  $$select public.set_event_todos('50000000-0000-0000-0000-000000000001', array['40000000-0000-0000-0000-000000000001']::uuid[], '{}')$$,
  '42501', null, '비로그인이면 잇지 못한다'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
select throws_ok(
  $$select public.schedule_todos(array['40000000-0000-0000-0000-000000000001']::uuid[], gen_random_uuid(), gen_random_uuid(), '2026-12-01', '바다', true)$$,
  '42501', null, '허용목록 밖 계정은 일정을 잡지 못한다'
);

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);

-- set_event_todos
select lives_ok(
  $$select public.set_event_todos('50000000-0000-0000-0000-000000000001', array['40000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000002']::uuid[], '{}')$$,
  '이어진 것이 없던 일정에 하고 싶은 것 둘을 한 번에 잇는다'
);
select results_eq(
  $$select id from public.todos where event_id = '50000000-0000-0000-0000-000000000001' order by id$$,
  $$values ('40000000-0000-0000-0000-000000000001'::uuid), ('40000000-0000-0000-0000-000000000002'::uuid)$$,
  '둘 다 그 일정에 이어진다'
);
select lives_ok(
  $$select public.set_event_todos('50000000-0000-0000-0000-000000000001', array['40000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000001']::uuid[], '{}')$$,
  '응답만 끊겨 같은 목록(순서는 달라도)으로 다시 보내도 성공한다'
);
select throws_ok(
  $$select public.set_event_todos('50000000-0000-0000-0000-000000000001', array['40000000-0000-0000-0000-000000000001']::uuid[], '{}')$$,
  'P0409', null, '폼을 연 뒤 상대가 연결을 바꿨으면 거부한다'
);
select lives_ok(
  $$select public.set_event_todos('50000000-0000-0000-0000-000000000001', array['40000000-0000-0000-0000-000000000001']::uuid[], array['40000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000002']::uuid[])$$,
  '둘 중 하나만 끊는다'
);
select results_eq(
  $$select id, event_id from public.todos where id in ('40000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000002') order by id$$,
  $$values ('40000000-0000-0000-0000-000000000001'::uuid, '50000000-0000-0000-0000-000000000001'::uuid), ('40000000-0000-0000-0000-000000000002'::uuid, null::uuid)$$,
  '끊은 것만 연결이 풀리고 나머지는 그대로다'
);

-- 다른 일정에 이어진 하고 싶은 것은 고르지 못한다(앱은 event_id를 쓰지 못해 관리자 권한으로 미리 잇는다)
reset role;
update public.todos set event_id = '50000000-0000-0000-0000-000000000002' where id = '40000000-0000-0000-0000-000000000003';
set local role authenticated;
select throws_ok(
  $$select public.set_event_todos('50000000-0000-0000-0000-000000000001', array['40000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000003']::uuid[], array['40000000-0000-0000-0000-000000000001']::uuid[])$$,
  'P0412', null, '하나라도 다른 일정이 있으면 잇지 않는다'
);
select is(
  (select event_id from public.todos where id = '40000000-0000-0000-0000-000000000002'),
  null, '거부하면 함께 고른 다른 하고 싶은 것도 잇지 않는다'
);
select throws_ok(
  $$select public.set_event_todos('50000000-0000-0000-0000-000000000001', array['40000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-0000000000ff']::uuid[], array['40000000-0000-0000-0000-000000000001']::uuid[])$$,
  'P0002', null, '없는(지워진) 하고 싶은 것은 잇지 않는다'
);
select throws_ok(
  $$select public.set_event_todos('50000000-0000-0000-0000-0000000000ff', array['40000000-0000-0000-0000-000000000002']::uuid[], '{}')$$,
  'P0002', null, '없는(지워진) 일정에는 잇지 않는다'
);
select throws_ok(
  $$select public.set_event_todos('50000000-0000-0000-0000-000000000003', array['40000000-0000-0000-0000-000000000002']::uuid[], '{}')$$,
  '22023', null, '반복 일정은 하고 싶은 것과 잇지 않는다'
);
select lives_ok(
  $$select public.set_event_todos('50000000-0000-0000-0000-000000000001', '{}', array['40000000-0000-0000-0000-000000000001']::uuid[])$$,
  '빈 목록이면 모두 끊는다'
);
select is(
  (select count(*)::int from public.todos where event_id = '50000000-0000-0000-0000-000000000001'),
  0, '모두 끊으면 이어진 것이 없다'
);

-- schedule_todos
select lives_ok(
  $$select public.schedule_todos(array['40000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000002']::uuid[], '50000000-0000-0000-0000-000000000011', '60000000-0000-0000-0000-000000000001', '2026-12-05', '회 먹기', true)$$,
  '하고 싶은 것 둘에 새 일정을 잡는다'
);
select results_eq(
  $$select id from public.todos where event_id = '50000000-0000-0000-0000-000000000011' order by id$$,
  $$values ('40000000-0000-0000-0000-000000000001'::uuid), ('40000000-0000-0000-0000-000000000002'::uuid)$$,
  '새 일정에 둘 다 이어진다'
);
select lives_ok(
  $$select public.schedule_todos(array['40000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000001']::uuid[], '50000000-0000-0000-0000-000000000011', '60000000-0000-0000-0000-000000000002', '2026-12-05', '부산 여행', true, null, null, null, null, array['60000000-0000-0000-0000-000000000001']::uuid[])$$,
  '응답만 끊겨 같은 일정 id로 다시 보내면 이번 값으로 고친다'
);
select is(
  (select title from public.events where id = '50000000-0000-0000-0000-000000000011'),
  '부산 여행', '다시 보낸 값이 남는다'
);
select throws_ok(
  $$select public.schedule_todos(array['40000000-0000-0000-0000-000000000001']::uuid[], '50000000-0000-0000-0000-000000000011', '60000000-0000-0000-0000-000000000003', '2026-12-05', '부산 여행', true, null, null, null, null, array['60000000-0000-0000-0000-000000000002']::uuid[])$$,
  'P0409', null, '다시 보낼 때 이어진 목록이 다르면(그사이 상대가 바꿈) 거부한다'
);
select throws_ok(
  $$select public.schedule_todos(array['40000000-0000-0000-0000-000000000004', '40000000-0000-0000-0000-000000000003']::uuid[], '50000000-0000-0000-0000-000000000012', gen_random_uuid(), '2026-12-06', '사진관', true)$$,
  'P0412', null, '하나라도 이미 일정이 있으면 일정을 잡지 않는다'
);
select ok(
  not exists (select 1 from public.events where id = '50000000-0000-0000-0000-000000000012')
    and (select event_id from public.todos where id = '40000000-0000-0000-0000-000000000004') is null,
  '거부하면 일정도 만들지 않고 다른 하고 싶은 것도 잇지 않는다'
);
select throws_ok(
  $$select public.schedule_todos('{}', gen_random_uuid(), gen_random_uuid(), '2026-12-06', '빈 일정', true)$$,
  '22023', null, '하고 싶은 것 없이는 일정을 잡지 않는다'
);

-- 예전 앱의 하나짜리 함수
select lives_ok(
  $$select public.set_event_todos('50000000-0000-0000-0000-000000000002', array['40000000-0000-0000-0000-000000000003', '40000000-0000-0000-0000-000000000004']::uuid[], array['40000000-0000-0000-0000-000000000003']::uuid[])$$,
  '다른 일정에도 둘을 잇는다'
);
select lives_ok(
  $$select public.set_event_todo('50000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000005', '40000000-0000-0000-0000-000000000003')$$,
  '예전 앱이 보던 하나를 다른 것으로 바꾼다'
);
select results_eq(
  $$select id from public.todos where event_id = '50000000-0000-0000-0000-000000000002' order by id$$,
  $$values ('40000000-0000-0000-0000-000000000004'::uuid), ('40000000-0000-0000-0000-000000000005'::uuid)$$,
  '예전 앱이 보지 못한 다른 연결은 그대로 남는다'
);
select lives_ok(
  $$select public.schedule_todo('40000000-0000-0000-0000-000000000006', '50000000-0000-0000-0000-000000000013', gen_random_uuid(), '2026-12-07', '케이크', true)$$,
  '예전 앱의 하나짜리 일정 잡기도 된다'
);

-- 기록을 남기면 이어진 것이 모두 완료된다(#473 트리거). 기록은 RLS를 거치지 않고 넣는다
reset role;
insert into public.dates (id, date, title, author_id, event_id, event_date) values
  ('70000000-0000-0000-0000-000000000001', '2026-11-20', '부산 여행', '00000000-0000-0000-0000-00000000000a', '50000000-0000-0000-0000-000000000011', '2026-12-05');
select is(
  (select count(*)::int from public.todos where event_id = '50000000-0000-0000-0000-000000000011' and completed_at is not null),
  2, '기록을 남기면 이어진 하고 싶은 것이 모두 완료된다'
);

select * from finish();
rollback;

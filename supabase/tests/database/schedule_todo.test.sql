-- 하고 싶은 것에 일정 잡기(#471): 일정을 만들며 잇기, 다시 보내도 같은 결과, 이미 일정이 있는 하고 싶은 것·없는 하고 싶은 것 거부,
-- 일정을 못 만들면 잇지도 않음, 일정을 지우면 연결만 풀림, 이어진 일정은 반복으로 바꾸지 못함, 직접 잇기 거부, 비로그인·허용목록 밖 거부를 확인한다.
begin;
create extension if not exists pgtap with schema extensions;

select plan(22);

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-00000000000a', 'a@schedule-todo.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000000b', 'outsider@schedule-todo.test', 'authenticated', 'authenticated');

insert into public.members (id, email, nickname) values
  ('00000000-0000-0000-0000-00000000000a', 'a@schedule-todo.test', 'A');

-- 테스트 데이터는 RLS를 거치지 않고 미리 넣는다
insert into public.todos (id, content, author_id) values
  ('40000000-0000-0000-0000-000000000001', '바다 보러 가기', '00000000-0000-0000-0000-00000000000a'),
  ('40000000-0000-0000-0000-000000000002', '성수 팝업', '00000000-0000-0000-0000-00000000000a'),
  ('40000000-0000-0000-0000-000000000003', '한강 라면', '00000000-0000-0000-0000-00000000000a');

insert into public.events (id, date, title, is_together, author_id) values
  ('50000000-0000-0000-0000-000000000099', '2026-12-01', '이어지지 않은 일정', true, '00000000-0000-0000-0000-00000000000a');

select has_function(
  'public', 'schedule_todo',
  array['uuid', 'uuid', 'uuid', 'date', 'text', 'boolean', 'time without time zone', 'date', 'text', 'text', 'uuid[]'],
  '하고 싶은 것에 일정을 만들어 잇는 함수가 있다'
);

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select throws_ok(
  $$select public.schedule_todo('40000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', gen_random_uuid(), '2026-11-23', '바다', true, null, null, null, null)$$,
  '42501', null, '비로그인이면 일정을 잡을 수 없다'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);

select throws_ok(
  $$select public.schedule_todo('40000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', gen_random_uuid(), '2026-11-23', '바다', true, null, null, null, null)$$,
  '42501', null, '허용목록 밖 계정은 일정을 잡을 수 없다'
);

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);

select lives_ok(
  $$select public.schedule_todo('40000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001', '2026-11-23', '바다 보러 가기', true, '10:00', '2026-11-24', '강릉', '기차 예매')$$,
  '하고 싶은 것에 일정을 만들어 잇는다'
);
select results_eq(
  $$select event_id from public.todos where id = '40000000-0000-0000-0000-000000000001'$$,
  $$values ('50000000-0000-0000-0000-000000000001'::uuid)$$,
  '하고 싶은 것에 만든 일정이 이어진다'
);
select results_eq(
  $$select date, start_time, end_date, title, place, memo, is_together, repeat_rule, author_id, revision from public.events where id = '50000000-0000-0000-0000-000000000001'$$,
  $$values ('2026-11-23'::date, '10:00'::time, '2026-11-24'::date, '바다 보러 가기', '강릉', '기차 예매', true, null::text,
    '00000000-0000-0000-0000-00000000000a'::uuid, '60000000-0000-0000-0000-000000000001'::uuid)$$,
  '일정은 받은 값과 판 번호로, 부른 사람이 작성자로 만들어지고 반복이 없다'
);

select lives_ok(
  $$select public.schedule_todo('40000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001', '2026-11-23', '바다 보러 가기', true, '10:00', '2026-11-24', '강릉', '기차 예매')$$,
  '응답만 끊겨 같은 일정·같은 판 번호로 다시 보내도 성공한다'
);
select lives_ok(
  $$select public.schedule_todo('40000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000002', '2026-11-23', '바다 보러 가자', true, '10:00', '2026-11-24', '강릉', '기차 예매', array['60000000-0000-0000-0000-000000000001']::uuid[])$$,
  '저장됐는지 모른 채 고쳐 다시 보내면 앞선 시도의 판에서 고친다'
);
select results_eq(
  $$select count(*)::int, max(title), max(revision::text) from public.events where id = '50000000-0000-0000-0000-000000000001'$$,
  $$values (1, '바다 보러 가자', '60000000-0000-0000-0000-000000000002')$$,
  '다시 보내도 일정이 하나이고, 마지막에 보낸 내용과 판 번호가 남는다'
);

-- 상대가 그 일정을 고친 뒤(판 번호가 바뀜) 내가 다시 보내면 덮어쓰지 않는다
update public.events set title = '상대가 고침', revision = '60000000-0000-0000-0000-0000000000aa' where id = '50000000-0000-0000-0000-000000000001';
select throws_ok(
  $$select public.schedule_todo('40000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000003', '2026-11-23', '바다 보러 가기', true, null, null, null, null, array['60000000-0000-0000-0000-000000000002']::uuid[])$$,
  'P0409', null, '다시 보내는 사이 상대가 일정을 고쳤으면 거부한다'
);
select is(
  (select title from public.events where id = '50000000-0000-0000-0000-000000000001'),
  '상대가 고침', '거부하면 상대가 고친 내용이 남는다'
);

select throws_ok(
  $$select public.schedule_todo('40000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000002', gen_random_uuid(), '2026-11-30', '바다 또', true, null, null, null, null)$$,
  'P0412', null, '이미 일정이 있는 하고 싶은 것에는 새 일정을 잡지 않는다'
);
select is(
  (select count(*)::int from public.events where id = '50000000-0000-0000-0000-000000000002'),
  0, '거부하면 일정을 만들지 않는다'
);

select throws_ok(
  $$select public.schedule_todo('40000000-0000-0000-0000-0000000000ff', '50000000-0000-0000-0000-000000000003', gen_random_uuid(), '2026-11-30', '없는 것', true, null, null, null, null)$$,
  'P0002', null, '없는(지워진) 하고 싶은 것에는 일정을 잡지 않는다'
);

select throws_ok(
  $$select public.schedule_todo('40000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000000004', gen_random_uuid(), '2026-11-30', '', true, null, null, null, null)$$,
  '23514', null, '일정 값이 틀려 만들지 못하면 오류를 낸다'
);
select is(
  (select event_id from public.todos where id = '40000000-0000-0000-0000-000000000002'),
  null, '일정을 만들지 못하면 잇지도 않는다'
);

select throws_ok(
  $$select public.schedule_todo('40000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000000099', gen_random_uuid(), '2026-11-30', '성수 팝업', true, null, null, null, null)$$,
  '23505', null, '이미 있는 다른 일정의 id로는 잇지 않는다'
);

select lives_ok(
  $$select public.schedule_todo('40000000-0000-0000-0000-000000000003', '50000000-0000-0000-0000-000000000005', gen_random_uuid(), '2026-11-28', '한강 라면', false, null, null, null, null)$$,
  '한 사람 일정으로도 잡을 수 있다'
);

select throws_ok(
  $$update public.events set repeat_rule = 'weekly' where id = '50000000-0000-0000-0000-000000000005'$$,
  '22023', null, '하고 싶은 것과 이어진 일정은 반복으로 바꾸지 않는다'
);

select throws_ok(
  $$update public.todos set event_id = '50000000-0000-0000-0000-000000000099' where id = '40000000-0000-0000-0000-000000000002'$$,
  '42501', null, '하고 싶은 것의 일정은 함수로만 잇는다'
);

delete from public.events where id = '50000000-0000-0000-0000-000000000001';
select results_eq(
  $$select content, event_id from public.todos where id = '40000000-0000-0000-0000-000000000001'$$,
  $$values ('바다 보러 가기', null::uuid)$$,
  '일정을 지우면 연결만 풀리고 하고 싶은 것은 남는다'
);

-- 다시 일정을 잡을 수 있다
select lives_ok(
  $$select public.schedule_todo('40000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000006', gen_random_uuid(), '2026-12-05', '바다 보러 가기', true, null, null, null, null)$$,
  '연결이 풀린 하고 싶은 것에는 다시 일정을 잡는다'
);

select * from finish();
rollback;

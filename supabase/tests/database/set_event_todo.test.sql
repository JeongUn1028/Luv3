-- 일정 폼에서 하고 싶은 것 잇기·끊기(#472): 잇기, 다시 보내도 같은 결과, 바꿔 잇기, 끊기, 그사이 연결이 바뀌었으면 거부,
-- 이미 일정이 있는 하고 싶은 것·없는 하고 싶은 것·없는 일정·반복 일정 거부, 비로그인·허용목록 밖 거부를 확인한다.
begin;
create extension if not exists pgtap with schema extensions;

select plan(16);

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-00000000000a', 'a@set-event-todo.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000000b', 'outsider@set-event-todo.test', 'authenticated', 'authenticated');

insert into public.members (id, email, nickname) values
  ('00000000-0000-0000-0000-00000000000a', 'a@set-event-todo.test', 'A');

-- 테스트 데이터는 RLS를 거치지 않고 미리 넣는다
insert into public.events (id, date, title, is_together, author_id, repeat_rule) values
  ('50000000-0000-0000-0000-000000000001', '2026-11-28', '성수 팝업', true, '00000000-0000-0000-0000-00000000000a', null),
  ('50000000-0000-0000-0000-000000000002', '2026-11-29', '다른 일정', true, '00000000-0000-0000-0000-00000000000a', null),
  ('50000000-0000-0000-0000-000000000003', '2026-11-30', '매주 산책', true, '00000000-0000-0000-0000-00000000000a', 'weekly');
insert into public.todos (id, content, author_id) values
  ('40000000-0000-0000-0000-000000000001', '성수 팝업 같이 가기', '00000000-0000-0000-0000-00000000000a'),
  ('40000000-0000-0000-0000-000000000002', '한강 라면', '00000000-0000-0000-0000-00000000000a'),
  ('40000000-0000-0000-0000-000000000003', '사진관', '00000000-0000-0000-0000-00000000000a');

select has_function('public', 'set_event_todo', array['uuid', 'uuid', 'uuid'], '일정의 하고 싶은 것 연결을 바꾸는 함수가 있다');

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok(
  $$select public.set_event_todo('50000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', null)$$,
  '42501', null, '비로그인이면 잇지 못한다'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
select throws_ok(
  $$select public.set_event_todo('50000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', null)$$,
  '42501', null, '허용목록 밖 계정은 잇지 못한다'
);

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);

select lives_ok(
  $$select public.set_event_todo('50000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', null)$$,
  '이어진 것이 없던 일정에 하고 싶은 것을 잇는다'
);
select is(
  (select event_id from public.todos where id = '40000000-0000-0000-0000-000000000001'),
  '50000000-0000-0000-0000-000000000001'::uuid, '하고 싶은 것에 그 일정이 이어진다'
);
select lives_ok(
  $$select public.set_event_todo('50000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', null)$$,
  '응답만 끊겨 같은 값으로 다시 보내도 성공한다'
);

select throws_ok(
  $$select public.set_event_todo('50000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000002', null)$$,
  'P0409', null, '폼을 연 뒤 상대가 연결을 바꿨으면 거부한다'
);
select is(
  (select event_id from public.todos where id = '40000000-0000-0000-0000-000000000002'),
  null, '거부하면 새로 고른 하고 싶은 것은 그대로다'
);

select lives_ok(
  $$select public.set_event_todo('50000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000001')$$,
  '다른 하고 싶은 것으로 바꿔 잇는다'
);
select results_eq(
  $$select id, event_id from public.todos where id in ('40000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000002') order by id$$,
  $$values ('40000000-0000-0000-0000-000000000001'::uuid, null::uuid), ('40000000-0000-0000-0000-000000000002'::uuid, '50000000-0000-0000-0000-000000000001'::uuid)$$,
  '앞의 하고 싶은 것은 연결이 풀리고 새로 고른 것이 이어진다'
);

-- 다른 일정에 이어진 하고 싶은 것은 고르지 못한다(앱은 event_id를 쓰지 못해 관리자 권한으로 미리 잇는다)
reset role;
update public.todos set event_id = '50000000-0000-0000-0000-000000000002' where id = '40000000-0000-0000-0000-000000000003';
set local role authenticated;
select throws_ok(
  $$select public.set_event_todo('50000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000003', '40000000-0000-0000-0000-000000000002')$$,
  'P0412', null, '이미 다른 일정이 있는 하고 싶은 것은 잇지 않는다'
);
select throws_ok(
  $$select public.set_event_todo('50000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-0000000000ff', '40000000-0000-0000-0000-000000000002')$$,
  'P0002', null, '없는(지워진) 하고 싶은 것은 잇지 않는다'
);
select throws_ok(
  $$select public.set_event_todo('50000000-0000-0000-0000-0000000000ff', '40000000-0000-0000-0000-000000000001', null)$$,
  'P0002', null, '없는(지워진) 일정에는 잇지 않는다'
);
select throws_ok(
  $$select public.set_event_todo('50000000-0000-0000-0000-000000000003', '40000000-0000-0000-0000-000000000001', null)$$,
  '22023', null, '반복 일정은 하고 싶은 것과 잇지 않는다'
);

select lives_ok(
  $$select public.set_event_todo('50000000-0000-0000-0000-000000000001', null, '40000000-0000-0000-0000-000000000002')$$,
  '연결을 끊는다'
);
select results_eq(
  $$select content, event_id from public.todos where id = '40000000-0000-0000-0000-000000000002'$$,
  $$values ('한강 라면', null::uuid)$$,
  '끊으면 하고 싶은 것은 남고 연결만 풀린다'
);

select * from finish();
rollback;

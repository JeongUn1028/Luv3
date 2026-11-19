-- 지난 일정 묻기(#471 ②): [아직]을 누른 날짜를 허용된 사람만 적고 둘 다 보며, 판 번호는 바꾸지 않고,
-- 연결된 일정이 바뀌거나 지워지면 지워지는지 확인한다.
begin;
create extension if not exists pgtap with schema extensions;

select plan(9);

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-00000000000a', 'a@todo-not-yet.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000000b', 'b@todo-not-yet.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000ff', 'outsider@todo-not-yet.test', 'authenticated', 'authenticated');

insert into public.members (id, email, nickname) values
  ('00000000-0000-0000-0000-00000000000a', 'a@todo-not-yet.test', 'A'),
  ('00000000-0000-0000-0000-00000000000b', 'b@todo-not-yet.test', 'B');

-- 테스트 데이터는 RLS를 거치지 않고 미리 넣는다
insert into public.events (id, date, title, is_together, author_id) values
  ('50000000-0000-0000-0000-000000000001', '2026-11-15', '바다 보러 가기', true, '00000000-0000-0000-0000-00000000000a'),
  ('50000000-0000-0000-0000-000000000002', '2026-11-15', '다시 잡은 바다', true, '00000000-0000-0000-0000-00000000000a');
insert into public.todos (id, content, author_id, event_id, revision) values
  ('40000000-0000-0000-0000-000000000001', '바다 보러 가기', '00000000-0000-0000-0000-00000000000a',
    '50000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001');

select has_column('public', 'todos', 'event_not_yet_date', '[아직]을 누른 일정 날짜 칸이 있다');

set local role authenticated;

-- 허용목록 밖 계정은 행이 보이지 않아 아무것도 바꾸지 못한다
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000ff","role":"authenticated"}', true);
select is_empty(
  $$update public.todos set event_not_yet_date = '2026-11-15' where id = '40000000-0000-0000-0000-000000000001' returning id$$,
  '허용목록 밖 계정은 [아직]을 적지 못한다'
);

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
select results_eq(
  $$update public.todos set event_not_yet_date = '2026-11-15' where id = '40000000-0000-0000-0000-000000000001' returning id$$,
  $$values ('40000000-0000-0000-0000-000000000001'::uuid)$$,
  '허용된 사람은 [아직]을 누른 일정 날짜를 적는다'
);
select is(
  (select revision from public.todos where id = '40000000-0000-0000-0000-000000000001'),
  '60000000-0000-0000-0000-000000000001'::uuid,
  '[아직]은 판 번호를 바꾸지 않아 열어 둔 고치기 화면의 저장을 막지 않는다'
);

-- 상대도 같은 값을 본다
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
select is(
  (select event_not_yet_date from public.todos where id = '40000000-0000-0000-0000-000000000001'),
  '2026-11-15'::date,
  '한 사람이 누른 [아직]을 상대도 본다'
);

-- 내용만 고치면 [아직]은 남는다
update public.todos set content = '바다 보러 가자' where id = '40000000-0000-0000-0000-000000000001';
select is(
  (select event_not_yet_date from public.todos where id = '40000000-0000-0000-0000-000000000001'),
  '2026-11-15'::date,
  '내용을 고쳐도 [아직]은 남는다'
);

-- 일정을 지우면 연결이 풀리며 [아직]도 지워진다
delete from public.events where id = '50000000-0000-0000-0000-000000000001';
select results_eq(
  $$select event_id, event_not_yet_date from public.todos where id = '40000000-0000-0000-0000-000000000001'$$,
  $$values (null::uuid, null::date)$$,
  '일정을 지우면 [아직]도 지워진다'
);

-- 다른 일정으로 이어지면(잇기 함수 안의 update) 앞 일정에 누른 [아직]은 남지 않는다
reset role;
update public.todos set event_id = '50000000-0000-0000-0000-000000000002', event_not_yet_date = '2026-11-15'
where id = '40000000-0000-0000-0000-000000000001';
select is(
  (select event_not_yet_date from public.todos where id = '40000000-0000-0000-0000-000000000001'),
  null::date,
  '다른 일정으로 이으면 앞 일정에 누른 [아직]은 지워진다'
);
update public.todos set event_not_yet_date = '2026-11-15' where id = '40000000-0000-0000-0000-000000000001';
update public.todos set event_id = '50000000-0000-0000-0000-000000000002' where id = '40000000-0000-0000-0000-000000000001';
select is(
  (select event_not_yet_date from public.todos where id = '40000000-0000-0000-0000-000000000001'),
  '2026-11-15'::date,
  '같은 일정 그대로면 [아직]은 남는다'
);

select * from finish();
rollback;

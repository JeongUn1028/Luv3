-- 반복 일정의 시작 날짜나 규칙을 바꾸면 건너뛴 날을 비우고 따로 고친 일정을 독립시키는지 확인한다(#27).
begin;
create extension if not exists pgtap with schema extensions;

select plan(9);

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-00000000000a', 'a@reset.test', 'authenticated', 'authenticated');

insert into public.members (id, email, nickname) values
  ('00000000-0000-0000-0000-00000000000a', 'a@reset.test', 'A');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);

insert into public.events (id, date, title, repeat_rule) values
  ('50000000-0000-0000-0000-000000000001', '2027-01-06', '수영', 'weekly'),
  ('50000000-0000-0000-0000-000000000002', '2027-01-06', '요가', 'weekly'),
  ('50000000-0000-0000-0000-000000000003', '2027-01-06', '러닝', 'weekly');

select public.detach_event_occurrence('50000000-0000-0000-0000-000000000001', '2027-01-13', '2027-01-14', '수영 옮김');
select public.detach_event_occurrence('50000000-0000-0000-0000-000000000002', '2027-01-13', '2027-01-14', '요가 옮김');
select public.detach_event_occurrence('50000000-0000-0000-0000-000000000003', '2027-01-13', '2027-01-14', '러닝 옮김');

-- 제목·끝나는 날만 고치면 그대로다
update public.events
  set title = '수영장', repeat_until = '2027-12-31'
  where id = '50000000-0000-0000-0000-000000000001';

select results_eq(
  $$select count(*)::int from public.event_exceptions where event_id = '50000000-0000-0000-0000-000000000001'$$,
  $$values (1)$$,
  '제목과 끝나는 날만 고치면 건너뛴 날이 남는다'
);

select results_eq(
  $$select repeat_parent_id from public.events where title = '수영 옮김'$$,
  $$values ('50000000-0000-0000-0000-000000000001'::uuid)$$,
  '제목과 끝나는 날만 고치면 따로 고친 일정이 반복에 이어져 있다'
);

-- 시작 날짜를 옮긴다
update public.events set date = '2027-01-07' where id = '50000000-0000-0000-0000-000000000001';

select results_eq(
  $$select count(*)::int from public.event_exceptions where event_id = '50000000-0000-0000-0000-000000000001'$$,
  $$values (0)$$,
  '시작 날짜를 옮기면 건너뛴 날을 비운다'
);

select results_eq(
  $$select repeat_parent_id from public.events where title = '수영 옮김'$$,
  $$values (null::uuid)$$,
  '시작 날짜를 옮기면 따로 고친 일정이 독립한다'
);

delete from public.events where id = '50000000-0000-0000-0000-000000000001';

select results_eq(
  $$select count(*)::int from public.events where title = '수영 옮김'$$,
  $$values (1)$$,
  '독립한 일정은 원래 일정을 지워도 남는다'
);

-- 규칙을 바꾼다
update public.events set repeat_rule = 'monthly' where id = '50000000-0000-0000-0000-000000000002';

select results_eq(
  $$select count(*)::int from public.event_exceptions where event_id = '50000000-0000-0000-0000-000000000002'$$,
  $$values (0)$$,
  '규칙을 바꾸면 건너뛴 날을 비운다'
);

-- 반복을 끈다
update public.events set repeat_rule = null where id = '50000000-0000-0000-0000-000000000003';

select results_eq(
  $$select repeat_parent_id from public.events where title = '러닝 옮김'$$,
  $$values (null::uuid)$$,
  '반복을 끄면 따로 고친 일정이 독립한다'
);

delete from public.events where id = '50000000-0000-0000-0000-000000000003';

select results_eq(
  $$select count(*)::int from public.events where title = '러닝 옮김'$$,
  $$values (1)$$,
  '반복을 끈 일정을 지워도 따로 고친 일정은 남는다'
);

select throws_ok(
  $$select public.reset_event_repeat_details()$$,
  '42501', null, '앱에서 초기화 함수를 직접 부를 수 없다'
);

select * from finish();
rollback;

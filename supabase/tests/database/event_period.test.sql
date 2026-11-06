-- 일정 기간(end_date): 하루 일정은 비워 두고, 시작일보다 늦지 않은 끝 날짜와 반복과 함께 쓰는 값은 거부하는지 확인한다.
begin;
create extension if not exists pgtap with schema extensions;

select plan(9);

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-00000000000a', 'a@event-period.test', 'authenticated', 'authenticated');

insert into public.members (id, email, nickname) values
  ('00000000-0000-0000-0000-00000000000a', 'a@event-period.test', 'A');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);

select lives_ok(
  $$insert into public.events (id, date, title, end_date) values
      ('50000000-0000-0000-0000-000000000001', '2026-11-07', '여행', '2026-11-09'),
      ('50000000-0000-0000-0000-000000000002', '2026-11-07', '하루', null)$$,
  '기간 일정과 하루 일정을 만든다'
);

select results_eq(
  $$select end_date from public.events where id = '50000000-0000-0000-0000-000000000002'$$,
  $$values (null::date)$$,
  '끝 날짜를 비우면 하루 일정으로 저장한다'
);

select throws_ok(
  $$insert into public.events (date, title, end_date) values ('2026-11-07', '같은 날', '2026-11-07')$$,
  '23514', null, '끝 날짜가 시작일과 같으면 거부한다'
);

select throws_ok(
  $$insert into public.events (date, title, end_date) values ('2026-11-07', '앞선 날', '2026-11-06')$$,
  '23514', null, '끝 날짜가 시작일보다 이르면 거부한다'
);

select throws_ok(
  $$insert into public.events (date, title, end_date, repeat_rule) values ('2026-11-07', '반복 기간', '2026-11-09', 'weekly')$$,
  '23514', null, '기간과 반복을 함께 쓸 수 없다'
);

select lives_ok(
  $$update public.events set end_date = '2026-11-10' where id = '50000000-0000-0000-0000-000000000001'$$,
  '허용된 사용자는 끝 날짜를 고칠 수 있다'
);

select results_eq(
  $$select end_date from public.events where id = '50000000-0000-0000-0000-000000000001'$$,
  $$values ('2026-11-10'::date)$$,
  '고친 끝 날짜가 저장된다'
);

select throws_ok(
  $$update public.events set date = '2026-11-10' where id = '50000000-0000-0000-0000-000000000001'$$,
  '23514', null, '시작일을 끝 날짜 뒤로 옮기면 거부한다'
);

select throws_ok(
  $$update public.events set repeat_rule = 'weekly' where id = '50000000-0000-0000-0000-000000000001'$$,
  '23514', null, '기간 일정에 반복을 더할 수 없다'
);

select * from finish();
rollback;

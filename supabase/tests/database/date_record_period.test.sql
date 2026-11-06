-- 기록 기간(end_date): 하루짜리는 비워 두고, 기간은 저장·수정·지우기가 되며, 시작일보다 늦지 않은 끝 날짜는 거부하는지 확인한다.
begin;
create extension if not exists pgtap with schema extensions;

select plan(13);

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-00000000000a', 'a@period.test', 'authenticated', 'authenticated');

insert into public.members (id, email, nickname) values
  ('00000000-0000-0000-0000-00000000000a', 'a@period.test', 'A');

-- 예전 시그니처가 남으면 인자 수에 따라 다른 함수를 부르게 되므로 하나만 있어야 한다
select has_function(
  'public', 'create_date_record',
  array['uuid', 'date', 'text', 'text', 'text', 'jsonb', 'uuid', 'date', 'text[]', 'jsonb'],
  '기록 작성 함수가 끝 날짜를 받는다'
);
select hasnt_function(
  'public', 'create_date_record',
  array['uuid', 'date', 'text', 'text', 'text', 'jsonb', 'uuid'],
  '끝 날짜 없는 예전 기록 작성 함수는 남아 있지 않다'
);
select has_function(
  'public', 'update_date_record',
  array['uuid', 'date', 'text', 'text', 'text', 'jsonb', 'uuid', 'date', 'text[]', 'jsonb', 'uuid[]', 'uuid'],
  '기록 수정 함수가 끝 날짜를 받는다'
);
select hasnt_function(
  'public', 'update_date_record',
  array['uuid', 'date', 'text', 'text', 'text', 'jsonb', 'uuid'],
  '끝 날짜 없는 예전 기록 수정 함수는 남아 있지 않다'
);

-- 비로그인(anon): 함수를 다시 만들면 권한도 처음부터라 다시 막혔는지 확인한다
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select throws_ok(
  $$select public.create_date_record(gen_random_uuid(), '2026-11-01', '제목', null, null, '[]', null, '2026-11-02')$$,
  '42501',
  null,
  '비로그인이면 기간을 넣어도 기록 작성 함수를 실행할 권한이 없다'
);

select throws_ok(
  $$select public.update_date_record(gen_random_uuid(), '2026-11-01', '제목', null, null, '[]', null, '2026-11-02')$$,
  '42501',
  null,
  '비로그인이면 기간을 넣어도 기록 수정 함수를 실행할 권한이 없다'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);

-- 끝 날짜를 비우면 하루짜리
select public.create_date_record(
  '10000000-0000-0000-0000-000000000001', '2026-11-01', '하루', null, null,
  '[{"id":"20000000-0000-0000-0000-000000000001"}]', '20000000-0000-0000-0000-000000000001');

select is(
  (select end_date from public.dates where id = '10000000-0000-0000-0000-000000000001'),
  null,
  '끝 날짜 없이 저장하면 하루짜리 기록이다'
);

-- 기간
select public.create_date_record(
  '10000000-0000-0000-0000-000000000002', '2026-10-31', '여행', null, null,
  '[{"id":"20000000-0000-0000-0000-000000000002"}]', '20000000-0000-0000-0000-000000000002', '2026-11-02');

select is(
  (select end_date from public.dates where id = '10000000-0000-0000-0000-000000000002'),
  '2026-11-02'::date,
  '끝 날짜를 넣으면 기간으로 저장한다'
);

select throws_ok(
  $$select public.create_date_record(
      '10000000-0000-0000-0000-000000000003', '2026-11-01', '같은 날', null, null,
      '[{"id":"20000000-0000-0000-0000-000000000003"}]', '20000000-0000-0000-0000-000000000003', '2026-11-01')$$,
  '23514',
  null,
  '끝 날짜가 시작일과 같으면 거부한다(하루짜리는 비워 두므로 같은 뜻을 두 가지로 저장하지 않는다)'
);

select throws_ok(
  $$select public.create_date_record(
      '10000000-0000-0000-0000-000000000003', '2026-11-01', '앞선 날', null, null,
      '[{"id":"20000000-0000-0000-0000-000000000003"}]', '20000000-0000-0000-0000-000000000003', '2026-10-31')$$,
  '23514',
  null,
  '끝 날짜가 시작일보다 이르면 거부한다'
);

-- 수정: 하루짜리 → 기간
select public.update_date_record(
  '10000000-0000-0000-0000-000000000001', '2026-11-01', '하루', null, null,
  '[{"id":"20000000-0000-0000-0000-000000000001"}]', '20000000-0000-0000-0000-000000000001', '2026-11-03');

select is(
  (select end_date from public.dates where id = '10000000-0000-0000-0000-000000000001'),
  '2026-11-03'::date,
  '수정 함수로 하루짜리 기록을 기간으로 바꾼다'
);

select throws_ok(
  $$select public.update_date_record(
      '10000000-0000-0000-0000-000000000001', '2026-11-03', '하루', null, null,
      '[{"id":"20000000-0000-0000-0000-000000000001"}]', '20000000-0000-0000-0000-000000000001', '2026-11-03')$$,
  '23514',
  null,
  '수정할 때도 끝 날짜가 시작일보다 늦지 않으면 거부한다'
);

-- 수정: 기간 → 하루짜리
select public.update_date_record(
  '10000000-0000-0000-0000-000000000002', '2026-10-31', '여행', null, null,
  '[{"id":"20000000-0000-0000-0000-000000000002"}]', '20000000-0000-0000-0000-000000000002');

select is(
  (select end_date from public.dates where id = '10000000-0000-0000-0000-000000000002'),
  null,
  '수정할 때 끝 날짜를 비우면 하루짜리로 돌아간다'
);

select * from finish();
rollback;

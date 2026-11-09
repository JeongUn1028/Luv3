-- 일정과 기록 연결(#227): 연결 저장, 같은 일정의 같은 날 중복 거부, 일정을 지워도 기록 유지, 하루만 고치면 기록이 따라감을 확인한다.
begin;
create extension if not exists pgtap with schema extensions;

select plan(14);

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-00000000000a', 'a@link.test', 'authenticated', 'authenticated');

insert into public.members (id, email, nickname) values
  ('00000000-0000-0000-0000-00000000000a', 'a@link.test', 'A');

-- 중복 거부가 알려 주는 기존 기록 id를 받아 둔다
create temp table caught_detail (detail text);
grant insert, select on caught_detail to authenticated;

select has_function(
  'public', 'create_date_record',
  array['uuid', 'date', 'text', 'text', 'text', 'jsonb', 'uuid', 'date', 'text[]', 'jsonb', 'uuid', 'date'],
  '기록 작성 함수가 일정 연결을 받는다'
);
-- 예전 시그니처가 남으면 인자 수에 따라 다른 함수를 부르게 되므로 하나만 있어야 한다
select hasnt_function(
  'public', 'create_date_record',
  array['uuid', 'date', 'text', 'text', 'text', 'jsonb', 'uuid', 'date', 'text[]', 'jsonb'],
  '연결 없는 예전 기록 작성 함수는 남아 있지 않다'
);

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select throws_ok(
  $$select public.create_date_record(gen_random_uuid(), '2026-10-01', '산책', null, null,
      '[{"id":"20000000-0000-0000-0000-000000000009","caption":""}]', '20000000-0000-0000-0000-000000000009',
      null, null, null, '30000000-0000-0000-0000-000000000001', '2026-10-01')$$,
  '42501',
  null,
  '비로그인이면 연결한 기록도 만들 수 없다'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);

insert into public.events (id, date, title, repeat_rule) values
  ('30000000-0000-0000-0000-000000000001', '2026-10-01', '산책', null),
  ('30000000-0000-0000-0000-000000000002', '2026-10-07', '수영', 'weekly');

select lives_ok(
  $$select public.create_date_record('10000000-0000-0000-0000-000000000001', '2026-10-01', '산책', null, null,
      '[{"id":"20000000-0000-0000-0000-000000000001","caption":""}]', '20000000-0000-0000-0000-000000000001',
      null, null, null, '30000000-0000-0000-0000-000000000001', '2026-10-01')$$,
  '일정에서 남긴 기록을 만든다'
);

select results_eq(
  $$select event_id, event_date from public.dates where id = '10000000-0000-0000-0000-000000000001'$$,
  $$values ('30000000-0000-0000-0000-000000000001'::uuid, '2026-10-01'::date)$$,
  '기록에 어느 일정의 어느 날인지 저장된다'
);

do $$
declare
  detail text;
begin
  perform public.create_date_record('10000000-0000-0000-0000-000000000002', '2026-10-01', '산책 또', null, null,
    '[{"id":"20000000-0000-0000-0000-000000000002","caption":""}]', '20000000-0000-0000-0000-000000000002',
    null, null, null, '30000000-0000-0000-0000-000000000001', '2026-10-01');
exception when sqlstate 'P0410' then
  get stacked diagnostics detail = pg_exception_detail;
  insert into caught_detail values (detail);
end;
$$;

select results_eq(
  $$select detail from caught_detail$$,
  $$values ('10000000-0000-0000-0000-000000000001')$$,
  '같은 일정의 같은 날에 또 남기면 P0410으로 거부하고 이미 남긴 기록 id를 알려 준다'
);

select is(
  (select count(*) from public.dates where id = '10000000-0000-0000-0000-000000000002'),
  0::bigint,
  '거부된 기록은 남지 않는다'
);

-- 응답만 끊겨 같은 id로 다시 보내면 연결이 겹쳐도 "이미 저장됨"(23505)으로 알려야 앱이 저장된 것으로 본다
select throws_ok(
  $$select public.create_date_record('10000000-0000-0000-0000-000000000001', '2026-10-01', '산책', null, null,
      '[{"id":"20000000-0000-0000-0000-000000000001","caption":""}]', '20000000-0000-0000-0000-000000000001',
      null, null, null, '30000000-0000-0000-0000-000000000001', '2026-10-01')$$,
  '23505',
  null,
  '같은 id로 다시 저장하면 연결 중복이 아니라 이미 저장된 것으로 알린다'
);

select lives_ok(
  $$select public.create_date_record('10000000-0000-0000-0000-000000000003', '2026-10-02', '없는 일정', null, null,
      '[{"id":"20000000-0000-0000-0000-000000000003","caption":""}]', '20000000-0000-0000-0000-000000000003',
      null, null, null, '30000000-0000-0000-0000-0000000000ff', '2026-10-02')$$,
  '없는 일정을 넘겨도 기록은 만든다'
);

select results_eq(
  $$select event_id, event_date from public.dates where id = '10000000-0000-0000-0000-000000000003'$$,
  $$values (null::uuid, null::date)$$,
  '없는 일정이면 연결 없이 남긴다'
);

-- 반복 일정의 한 날에 기록을 잇고, 그날만 고친다
select public.create_date_record('10000000-0000-0000-0000-000000000004', '2026-10-14', '수영', null, null,
  '[{"id":"20000000-0000-0000-0000-000000000004","caption":""}]', '20000000-0000-0000-0000-000000000004',
  null, null, null, '30000000-0000-0000-0000-000000000002', '2026-10-14');
select public.create_date_record('10000000-0000-0000-0000-000000000005', '2026-10-21', '수영', null, null,
  '[{"id":"20000000-0000-0000-0000-000000000005","caption":""}]', '20000000-0000-0000-0000-000000000005',
  null, null, null, '30000000-0000-0000-0000-000000000002', '2026-10-21');
select public.detach_event_occurrence('30000000-0000-0000-0000-000000000002', '2026-10-14', '2026-10-15', '수영 옮김');

select results_eq(
  $$select record.event_date, event.title from public.dates as record join public.events as event on event.id = record.event_id
    where record.id = '10000000-0000-0000-0000-000000000004'$$,
  $$values ('2026-10-15'::date, '수영 옮김')$$,
  '하루만 고치면 그날의 기록은 떼어 낸 일정으로 옮긴다'
);

-- 전체 고치기로 시작 날짜를 바꿔도 연결은 그대로 둔다(되돌리면 다시 이어진다)
update public.events set date = '2026-10-08' where id = '30000000-0000-0000-0000-000000000002';

select results_eq(
  $$select event_id, event_date from public.dates where id = '10000000-0000-0000-0000-000000000005'$$,
  $$values ('30000000-0000-0000-0000-000000000002'::uuid, '2026-10-21'::date)$$,
  '반복 일정의 날짜를 바꿔도 다른 날의 연결은 남는다'
);

delete from public.events where id = '30000000-0000-0000-0000-000000000001';

select results_eq(
  $$select title, event_id, event_date from public.dates where id = '10000000-0000-0000-0000-000000000001'$$,
  $$values ('산책', null::uuid, null::date)$$,
  '일정을 지워도 기록은 남고 연결만 끊긴다'
);

select throws_ok(
  $$update public.dates set event_id = '30000000-0000-0000-0000-000000000002', event_date = null
    where id = '10000000-0000-0000-0000-000000000003'$$,
  '23514',
  null,
  '일정만 있고 날짜가 없는 연결은 받지 않는다'
);

select * from finish();
rollback;

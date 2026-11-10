-- 이미 쓴 기록을 일정에 잇고 끊기(#237): 잇기, 다시 눌러도 같은 결과, 중복·다른 일정·개인 일정·앞으로의 일정·일정이 없는 날·겹치지 않는 날 거부,
-- 연결 끊기, 비로그인·허용목록 밖 거부를 확인한다.
begin;
create extension if not exists pgtap with schema extensions;

select plan(26);

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-00000000000a', 'a@link-record.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000000b', 'outsider@link-record.test', 'authenticated', 'authenticated');

insert into public.members (id, email, nickname) values
  ('00000000-0000-0000-0000-00000000000a', 'a@link-record.test', 'A');

-- 테스트 데이터는 RLS를 거치지 않고 미리 넣는다
insert into public.events (id, date, title, is_together, repeat_rule, end_date, author_id) values
  ('30000000-0000-0000-0000-000000000001', '2026-10-01', '산책', true, null, null, '00000000-0000-0000-0000-00000000000a'),
  ('30000000-0000-0000-0000-000000000002', '2026-10-07', '수영', true, 'weekly', null, '00000000-0000-0000-0000-00000000000a'),
  ('30000000-0000-0000-0000-000000000003', '2026-10-10', '여행', true, null, '2026-10-12', '00000000-0000-0000-0000-00000000000a'),
  ('30000000-0000-0000-0000-000000000004', '2026-10-01', '혼자 운동', false, null, null, '00000000-0000-0000-0000-00000000000a'),
  ('30000000-0000-0000-0000-000000000005', '2999-01-01', '먼 약속', true, null, null, '00000000-0000-0000-0000-00000000000a');

insert into public.event_exceptions (event_id, date) values
  ('30000000-0000-0000-0000-000000000002', '2026-10-21');

insert into public.dates (id, date, end_date, title, author_id) values
  ('10000000-0000-0000-0000-000000000001', '2026-10-01', null, '산책 기록', '00000000-0000-0000-0000-00000000000a'),
  ('10000000-0000-0000-0000-000000000002', '2026-10-01', null, '산책 또', '00000000-0000-0000-0000-00000000000a'),
  ('10000000-0000-0000-0000-000000000003', '2026-10-14', null, '수영 기록', '00000000-0000-0000-0000-00000000000a'),
  ('10000000-0000-0000-0000-000000000004', '2026-10-11', '2026-10-13', '여행 기록', '00000000-0000-0000-0000-00000000000a'),
  ('10000000-0000-0000-0000-000000000005', '2026-10-21', null, '건너뛴 날 기록', '00000000-0000-0000-0000-00000000000a'),
  ('10000000-0000-0000-0000-000000000006', '2026-10-02', null, '다음 날 기록', '00000000-0000-0000-0000-00000000000a');

-- 중복 거부가 알려 주는 기존 기록 id를 받아 둔다
create temp table caught_detail (detail text);
grant insert, select on caught_detail to authenticated;

select has_function('public', 'link_date_record', array['uuid', 'uuid', 'date'], '기록을 일정의 그날에 잇는 함수가 있다');
select has_function('public', 'unlink_date_record', array['uuid', 'uuid'], '기록과 일정의 연결을 끊는 함수가 있다');

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select throws_ok(
  $$select public.link_date_record('10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '2026-10-01')$$,
  '42501', null, '비로그인이면 기록을 이을 수 없다'
);
select throws_ok(
  $$select public.unlink_date_record('10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001')$$,
  '42501', null, '비로그인이면 연결을 끊을 수 없다'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);

select throws_ok(
  $$select public.link_date_record('10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '2026-10-01')$$,
  '42501', null, '허용목록 밖 계정은 기록을 이을 수 없다'
);

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);

select lives_ok(
  $$select public.link_date_record('10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '2026-10-01')$$,
  '함께 일정의 그날에 이미 쓴 기록을 잇는다'
);
select results_eq(
  $$select event_id, event_date from public.dates where id = '10000000-0000-0000-0000-000000000001'$$,
  $$values ('30000000-0000-0000-0000-000000000001'::uuid, '2026-10-01'::date)$$,
  '기록에 어느 일정의 어느 날인지 저장된다'
);
select lives_ok(
  $$select public.link_date_record('10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '2026-10-01')$$,
  '이미 그 일정의 그날에 이어진 기록을 다시 이어도 그대로 둔다(두 번 누르기·다시 보내기)'
);

do $$
declare
  detail text;
begin
  perform public.link_date_record('10000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000001', '2026-10-01');
exception when sqlstate 'P0410' then
  get stacked diagnostics detail = pg_exception_detail;
  insert into caught_detail values (detail);
end;
$$;

select results_eq(
  $$select detail from caught_detail$$,
  $$values ('10000000-0000-0000-0000-000000000001')$$,
  '같은 일정의 같은 날에 이미 기록이 있으면 P0410으로 거부하고 그 기록 id를 알려 준다'
);
select throws_ok(
  $$select public.link_date_record('10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000003', '2026-10-10')$$,
  'P0411', null, '다른 일정과 이어진 기록은 끊기 전에는 다시 잇지 않는다'
);
select throws_ok(
  $$select public.link_date_record('10000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000004', '2026-10-01')$$,
  '22023', null, '한 사람 일정에는 잇지 않는다'
);
select throws_ok(
  $$select public.link_date_record('10000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000005', '2999-01-01')$$,
  '22023', null, '아직 오지 않은 일정에는 잇지 않는다'
);
select throws_ok(
  $$select public.link_date_record('10000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000002', '2026-10-15')$$,
  '22023', null, '반복 일정이 오지 않는 날에는 잇지 않는다'
);
select throws_ok(
  $$select public.link_date_record('10000000-0000-0000-0000-000000000005', '30000000-0000-0000-0000-000000000002', '2026-10-21')$$,
  '22023', null, '반복 일정에서 건너뛴 날에는 잇지 않는다'
);
select throws_ok(
  $$select public.link_date_record('10000000-0000-0000-0000-000000000006', '30000000-0000-0000-0000-000000000001', '2026-10-01')$$,
  '22023', null, '기록 날짜가 일정 날짜와 겹치지 않으면 잇지 않는다'
);
select throws_ok(
  $$select public.link_date_record('10000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-0000000000ff', '2026-10-01')$$,
  'P0002', null, '없는 일정에는 잇지 않는다'
);
select throws_ok(
  $$select public.link_date_record('10000000-0000-0000-0000-0000000000ff', '30000000-0000-0000-0000-000000000001', '2026-10-01')$$,
  'P0002', null, '없는 기록은 잇지 않는다'
);

select lives_ok(
  $$select public.link_date_record('10000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000002', '2026-10-14')$$,
  '반복 일정은 오는 날에 잇는다'
);
select throws_ok(
  $$select public.link_date_record('10000000-0000-0000-0000-000000000004', '30000000-0000-0000-0000-000000000003', '2026-10-11')$$,
  '22023', null, '기간 일정은 시작일이 아닌 날로 잇지 않는다(연결 날짜는 시작일)'
);
select lives_ok(
  $$select public.link_date_record('10000000-0000-0000-0000-000000000004', '30000000-0000-0000-0000-000000000003', '2026-10-10')$$,
  '기간 일정은 기간과 겹치는 기록을 시작일로 잇는다'
);

-- 반복이 아닌 일정은 날짜를 옮겨도 같은 일이라, 옮기기 전 날짜로 이어진 기록이 있으면 새 날짜로 또 잇지 않는다
reset role;
update public.events set date = '2026-10-03' where id = '30000000-0000-0000-0000-000000000001';
update public.dates set date = '2026-10-03' where id = '10000000-0000-0000-0000-000000000002';
set local role authenticated;
select throws_ok(
  $$select public.link_date_record('10000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000001', '2026-10-03')$$,
  'P0410', null, '반복이 아닌 일정에 이미 이어진 기록이 있으면 날짜를 옮긴 뒤에도 다른 기록을 잇지 않는다'
);

select lives_ok(
  $$select public.unlink_date_record('10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000003')$$,
  '다른 일정을 넘겨도 오류 없이 끝난다'
);
select results_eq(
  $$select event_id from public.dates where id = '10000000-0000-0000-0000-000000000001'$$,
  $$values ('30000000-0000-0000-0000-000000000001'::uuid)$$,
  '화면이 본 일정과 지금 이어진 일정이 다르면(그사이 다시 이은 경우) 연결을 끊지 않는다'
);
select lives_ok(
  $$select public.unlink_date_record('10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001')$$,
  '기록과 일정의 연결을 끊는다'
);
select results_eq(
  $$select (select count(*) from public.dates where id = '10000000-0000-0000-0000-000000000001' and event_id is null and event_date is null),
      (select count(*) from public.events where id = '30000000-0000-0000-0000-000000000001')$$,
  $$values (1::bigint, 1::bigint)$$,
  '연결만 끊고 기록과 일정은 그대로 남는다'
);
select throws_ok(
  $$select public.unlink_date_record('10000000-0000-0000-0000-0000000000ff', '30000000-0000-0000-0000-000000000001')$$,
  'P0002', null, '없는 기록이면 끊지 못했다고 알린다'
);

select * from finish();
rollback;

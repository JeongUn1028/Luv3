-- 기록 남기면 하고 싶은 것 완료(#473): "기록 남기기"(create_date_record)와 "일정과 잇기"(link_date_record)로 기록이 일정과 이어지면
-- 그 일정의 하고 싶은 것을 완료하고, 이미 기록이 있는 일정에 하고 싶은 것을 이어도(set_event_todo) 완료하며, 이미 완료한 것·다른 하고 싶은 것은 그대로 두며, 연결을 끊거나 기록을 지워도 완료를 되돌리지 않음을 확인한다.
begin;
create extension if not exists pgtap with schema extensions;

select plan(12);

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-00000000000a', 'a@complete-todo.test', 'authenticated', 'authenticated');
insert into public.members (id, email, nickname) values
  ('00000000-0000-0000-0000-00000000000a', 'a@complete-todo.test', 'A');

-- 테스트 데이터는 RLS를 거치지 않고 미리 넣는다
insert into public.events (id, date, title, is_together, author_id) values
  ('30000000-0000-0000-0000-000000000001', '2026-10-01', '성수 팝업', true, '00000000-0000-0000-0000-00000000000a'),
  ('30000000-0000-0000-0000-000000000002', '2026-10-02', '한강', true, '00000000-0000-0000-0000-00000000000a'),
  ('30000000-0000-0000-0000-000000000003', '2026-10-03', '사진관', true, '00000000-0000-0000-0000-00000000000a');
insert into public.todos (id, content, author_id, event_id, completed_at, revision) values
  ('40000000-0000-0000-0000-000000000001', '성수 팝업 같이 가기', '00000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-000000000001', null, '90000000-0000-0000-0000-000000000001'),
  ('40000000-0000-0000-0000-000000000002', '한강 라면', '00000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-000000000002', '2026-10-05 12:00:00+09', '90000000-0000-0000-0000-000000000001'),
  ('40000000-0000-0000-0000-000000000003', '사진관 가기', '00000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-000000000003', null, '90000000-0000-0000-0000-000000000001'),
  ('40000000-0000-0000-0000-000000000004', '일정 없는 것', '00000000-0000-0000-0000-00000000000a', null, null, '90000000-0000-0000-0000-000000000001');
insert into public.dates (id, date, title, author_id) values
  ('10000000-0000-0000-0000-000000000003', '2026-10-03', '사진관 기록', '00000000-0000-0000-0000-00000000000a');

select has_trigger('public', 'dates', 'dates_complete_todo_on_insert', '일정에서 기록을 남기면 하고 싶은 것을 완료하는 트리거가 있다');
select has_trigger('public', 'dates', 'dates_complete_todo_on_link', '이미 쓴 기록을 일정과 이으면 하고 싶은 것을 완료하는 트리거가 있다');
select has_trigger('public', 'todos', 'todos_complete_on_recorded_event', '기록이 있는 일정에 하고 싶은 것을 이으면 완료하는 트리거가 있다');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);

-- 기록 남기기
select public.create_date_record(
  '10000000-0000-0000-0000-000000000001', '2026-10-01', '성수 팝업 기록', null,
  '[{"id":"11000000-0000-0000-0000-000000000001","location":{"place":"성수","lat":37.5,"lng":127.0},"photos":[{"id":"20000000-0000-0000-0000-000000000001"}]}]',
  '20000000-0000-0000-0000-000000000001', null, null, '30000000-0000-0000-0000-000000000001', '2026-10-01'
);
select results_eq(
  $$select completed_at is not null, revision from public.todos where id = '40000000-0000-0000-0000-000000000001'$$,
  $$values (true, '90000000-0000-0000-0000-000000000001'::uuid)$$,
  '일정에서 기록을 남기면 그 일정의 하고 싶은 것이 완료되고 판 번호는 그대로다'
);

select public.create_date_record(
  '10000000-0000-0000-0000-000000000002', '2026-10-02', '한강 기록', null,
  '[{"id":"11000000-0000-0000-0000-000000000002","location":{"place":"한강","lat":37.5,"lng":127.0},"photos":[{"id":"20000000-0000-0000-0000-000000000002"}]}]',
  '20000000-0000-0000-0000-000000000002', null, null, '30000000-0000-0000-0000-000000000002', '2026-10-02'
);
select is(
  (select completed_at from public.todos where id = '40000000-0000-0000-0000-000000000002'),
  '2026-10-05 12:00:00+09'::timestamptz, '이미 완료한 하고 싶은 것은 완료 시각을 바꾸지 않는다'
);

-- 이미 쓴 기록을 일정과 잇기
select is(
  (select completed_at from public.todos where id = '40000000-0000-0000-0000-000000000003'),
  null, '잇기 전에는 완료되지 않았다'
);
select public.link_date_record('10000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000003', '2026-10-03');
select results_eq(
  $$select completed_at is not null, revision from public.todos where id = '40000000-0000-0000-0000-000000000003'$$,
  $$values (true, '90000000-0000-0000-0000-000000000001'::uuid)$$,
  '이미 쓴 기록을 그 일정과 이으면 하고 싶은 것이 완료되고 판 번호는 그대로다'
);
select is(
  (select completed_at from public.todos where id = '40000000-0000-0000-0000-000000000004'),
  null, '다른 하고 싶은 것은 그대로다'
);

-- 되돌리지 않는다
select public.unlink_date_record('10000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000003');
select isnt(
  (select completed_at from public.todos where id = '40000000-0000-0000-0000-000000000003'),
  null, '연결을 끊어도 완료는 그대로다'
);
delete from public.dates where id = '10000000-0000-0000-0000-000000000001';
select isnt(
  (select completed_at from public.todos where id = '40000000-0000-0000-0000-000000000001'),
  null, '기록을 지워도 완료는 그대로다'
);

-- 손으로 완료를 푼 뒤 기록을 고쳐도(이어진 일정이 그대로면) 다시 완료하지 않는다
update public.todos set completed_at = null where id = '40000000-0000-0000-0000-000000000002';
-- 앱은 기록을 함수로만 고치므로 제목만 바꾸는 고치기는 관리자 권한으로 흉내 낸다
reset role;
update public.dates set title = '한강 기록 고침' where id = '10000000-0000-0000-0000-000000000002';
select is(
  (select completed_at from public.todos where id = '40000000-0000-0000-0000-000000000002'),
  null, '이어진 일정이 그대로인 기록 고치기는 완료를 다시 하지 않는다'
);

-- 이미 기록이 있는 일정에 일정 폼에서 하고 싶은 것을 잇기(#472)
set local role authenticated;
select public.set_event_todo('30000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000004', '40000000-0000-0000-0000-000000000002');
select isnt(
  (select completed_at from public.todos where id = '40000000-0000-0000-0000-000000000004'),
  null, '기록이 있는 일정에 하고 싶은 것을 이으면 완료된다'
);

select * from finish();
rollback;

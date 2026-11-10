-- 열어 둔 사이 상대가 고친 일정·하고 싶은 것을 알아보는 판 번호(#161)
begin;
create extension if not exists pgtap with schema extensions;

select plan(18);

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-00000000000a', 'a@event-revision.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000000b', 'b@event-revision.test', 'authenticated', 'authenticated');

insert into public.members (id, email, nickname) values
  ('00000000-0000-0000-0000-00000000000a', 'a@event-revision.test', 'A'),
  ('00000000-0000-0000-0000-00000000000b', 'b@event-revision.test', 'B');

-- 매주 월요일 반복
insert into public.events (id, date, title, repeat_rule, author_id, revision) values
  ('10000000-0000-0000-0000-000000000001', '2026-11-02', '반복', 'weekly', '00000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-000000000001');

insert into public.todos (id, content, author_id, revision) values
  ('20000000-0000-0000-0000-000000000001', '처음', '00000000-0000-0000-0000-00000000000a', '40000000-0000-0000-0000-000000000001');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);

-- 판 번호를 넘기지 않는 고치기(예전 앱)도 판 번호를 바꿔야 열어 둔 상대의 화면이 알아챈다
update public.events set title = '예전 앱이 고침' where id = '10000000-0000-0000-0000-000000000001';
select isnt(
  (select revision from public.events where id = '10000000-0000-0000-0000-000000000001'),
  '30000000-0000-0000-0000-000000000001'::uuid,
  '판 번호 없이 일정 내용을 고쳐도 판 번호가 바뀐다'
);

update public.events set title = '앱이 고침', revision = '30000000-0000-0000-0000-000000000002'
where id = '10000000-0000-0000-0000-000000000001';
select is(
  (select revision from public.events where id = '10000000-0000-0000-0000-000000000001'),
  '30000000-0000-0000-0000-000000000002'::uuid,
  '앱이 넘긴 판 번호를 그대로 쓴다'
);

-- 응답만 끊겨 같은 요청을 다시 보내면 판 번호가 그대로여야 다음 저장이 내 판을 알아본다
update public.events set title = '앱이 고침', revision = '30000000-0000-0000-0000-000000000002'
where id = '10000000-0000-0000-0000-000000000001';
select is(
  (select revision from public.events where id = '10000000-0000-0000-0000-000000000001'),
  '30000000-0000-0000-0000-000000000002'::uuid,
  '같은 내용·같은 판 번호로 다시 보내면 판 번호가 그대로다'
);

-- 내용이 같아도 반복 규칙이 바뀌면 다른 일정이 된다
update public.events set repeat_until = '2026-12-31' where id = '10000000-0000-0000-0000-000000000001';
select isnt(
  (select revision from public.events where id = '10000000-0000-0000-0000-000000000001'),
  '30000000-0000-0000-0000-000000000002'::uuid,
  '반복 끝나는 날만 고쳐도 판 번호가 바뀐다'
);

update public.events set revision = '30000000-0000-0000-0000-000000000003' where id = '10000000-0000-0000-0000-000000000001';

update public.todos set completed_at = now() where id = '20000000-0000-0000-0000-000000000001';
select is(
  (select revision from public.todos where id = '20000000-0000-0000-0000-000000000001'),
  '40000000-0000-0000-0000-000000000001'::uuid,
  '완료 체크만 바꾸면 하고 싶은 것의 판 번호는 그대로다(내용 고치기와 겹치지 않는다)'
);

update public.todos set content = '예전 앱이 고침' where id = '20000000-0000-0000-0000-000000000001';
select isnt(
  (select revision from public.todos where id = '20000000-0000-0000-0000-000000000001'),
  '40000000-0000-0000-0000-000000000001'::uuid,
  '판 번호 없이 내용을 고쳐도 하고 싶은 것의 판 번호가 바뀐다'
);

select lives_ok(
  $$insert into public.todos (id, content, revision) values ('20000000-0000-0000-0000-000000000002', '새 항목', '40000000-0000-0000-0000-000000000002')$$,
  '새 하고 싶은 것을 앱이 정한 판 번호로 만들 수 있다'
);

-- 이 날만 고치기: 폼을 연 뒤 상대가 반복 전체를 고쳤으면 거부한다(요일이 옮겨져 일정이 두 줄이 되지 않게)
select throws_ok(
  $$select public.detach_event_occurrence(
      p_event_id => '10000000-0000-0000-0000-000000000001', p_occurrence_date => '2026-11-09', p_date => '2026-11-10', p_title => '이 날만',
      p_expected_revisions => array['30000000-0000-0000-0000-000000000002']::uuid[], p_new_event_id => '10000000-0000-0000-0000-000000000002')$$,
  'P0409',
  NULL,
  '반복 일정의 판 번호가 바뀌었으면 이 날만 고치기를 거부한다'
);

select is(
  (select count(*)::int from public.event_exceptions where event_id = '10000000-0000-0000-0000-000000000001'),
  0,
  '거부하면 건너뛰는 날을 남기지 않는다'
);

select is(
  public.detach_event_occurrence(
    p_event_id => '10000000-0000-0000-0000-000000000001', p_occurrence_date => '2026-11-09', p_date => '2026-11-10', p_title => '이 날만',
    p_expected_revisions => array['30000000-0000-0000-0000-000000000003']::uuid[], p_new_event_id => '10000000-0000-0000-0000-000000000002'),
  '10000000-0000-0000-0000-000000000002'::uuid,
  '판 번호가 같으면 앱이 정한 id로 따로 나온 일정을 만든다'
);

-- 응답만 끊겨 다시 보낸 것: 이미 건너뛴 날이라고 거부하지 않고 앞서 만든 일정을 돌려준다
select is(
  public.detach_event_occurrence(
    p_event_id => '10000000-0000-0000-0000-000000000001', p_occurrence_date => '2026-11-09', p_date => '2026-11-10', p_title => '이 날만',
    p_expected_revisions => array['30000000-0000-0000-0000-000000000003']::uuid[], p_new_event_id => '10000000-0000-0000-0000-000000000002'),
  '10000000-0000-0000-0000-000000000002'::uuid,
  '같은 id로 다시 보내면 앞서 만든 일정을 돌려준다'
);

select is(
  (select count(*)::int from public.events where repeat_parent_id = '10000000-0000-0000-0000-000000000001'),
  1,
  '다시 보내도 따로 나온 일정은 하나다'
);

-- 다시 보내기 전에 고친 내용은 앞서 만든 일정에 반영한다. 반영하지 않으면 저장했다고 알리고 고친 내용을 버린다
select is(
  public.detach_event_occurrence(
    p_event_id => '10000000-0000-0000-0000-000000000001', p_occurrence_date => '2026-11-09', p_date => '2026-11-11', p_title => '이 날만 고침',
    p_start_time => '19:00', p_place => '강남', p_memo => '메모',
    p_expected_revisions => array['30000000-0000-0000-0000-000000000003']::uuid[], p_new_event_id => '10000000-0000-0000-0000-000000000002'),
  '10000000-0000-0000-0000-000000000002'::uuid,
  '고친 내용으로 다시 보내도 앞서 만든 일정을 돌려준다'
);

select results_eq(
  $$select date, start_time, title, place, memo from public.events where id = '10000000-0000-0000-0000-000000000002'$$,
  $$values ('2026-11-11'::date, '19:00'::time, '이 날만 고침'::text, '강남'::text, '메모'::text)$$,
  '다시 보내며 고친 날짜·시간·제목·장소·메모가 따로 나온 일정에 반영된다'
);

-- 다른 날을 같은 id로 보내면 앞선 시도가 아니다
select throws_ok(
  $$select public.detach_event_occurrence(
      p_event_id => '10000000-0000-0000-0000-000000000001', p_occurrence_date => '2026-11-16', p_date => '2026-11-16', p_title => '다른 날',
      p_new_event_id => '10000000-0000-0000-0000-000000000002')$$,
  '23505',
  NULL,
  '다른 날을 이미 쓴 id로 보내면 거부한다'
);

-- 판 번호와 id를 넘기지 않는 예전 앱도 그대로 쓸 수 있다
select lives_ok(
  $$select public.detach_event_occurrence(
      p_event_id => '10000000-0000-0000-0000-000000000001', p_occurrence_date => '2026-11-23', p_date => '2026-11-23', p_title => '예전 앱')$$,
  '판 번호 없이 이 날만 고칠 수 있다'
);

reset role;

select ok(
  not has_function_privilege('authenticated', 'public.bump_event_revision()', 'execute')
    and not has_function_privilege('authenticated', 'public.bump_todo_revision()', 'execute'),
  '판 번호를 바꾸는 트리거 함수는 회원이 직접 부를 수 없다'
);

select ok(
  not has_function_privilege('anon', 'public.detach_event_occurrence(uuid, date, date, text, time, text, text, uuid[], uuid)', 'execute'),
  '비로그인은 이 날만 고치기를 부를 수 없다'
);

select * from finish();
rollback;

-- 하고 싶은 것(todos): 허용된 두 사람은 하나의 목록을 함께 보고 고치고 지우며, 작성자는 바꿀 수 없다.
-- 순서 바꾸기(move_todo)는 완료하지 않은 항목끼리 바로 옆 항목과 자리를 바꾼다.
-- 비로그인·허용목록 밖 사용자는 읽지도 쓰지도 옮기지도 못하는지 확인한다.
begin;
create extension if not exists pgtap with schema extensions;

select plan(27);

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-00000000000a', 'a@todos.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000000b', 'b@todos.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000ff', 'outsider@todos.test', 'authenticated', 'authenticated');

insert into public.members (id, email, nickname) values
  ('00000000-0000-0000-0000-00000000000a', 'a@todos.test', 'A'),
  ('00000000-0000-0000-0000-00000000000b', 'b@todos.test', 'B');

-- move_todo는 목록 전체에서 바로 옆 항목을 찾으므로, 로컬 DB에 남은 항목이 끼어들지 않게 비우고 시작한다
-- (트랜잭션 끝에 rollback하므로 실제 데이터는 그대로 남는다)
delete from public.todos;

select has_table('public', 'todos', '하고 싶은 것 테이블이 있다');

-- 비로그인(anon)
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select throws_ok('select * from public.todos', '42501', null, '비로그인이면 목록을 조회할 권한이 없다');

select throws_ok(
  $$select public.move_todo('40000000-0000-0000-0000-000000000001', -1)$$,
  '42501',
  null,
  '비로그인이면 순서를 바꿀 권한이 없다'
);

-- a가 세 개를 차례로 만든다
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);

select lives_ok(
  $$insert into public.todos (id, content) values ('40000000-0000-0000-0000-000000000001', '제주도 여행')$$,
  '허용된 사용자는 하고 싶은 것을 추가한다'
);
select lives_ok(
  $$insert into public.todos (id, content) values ('40000000-0000-0000-0000-000000000002', '한강 피크닉')$$,
  '두 번째 항목을 추가한다'
);
select lives_ok(
  $$insert into public.todos (id, content) values ('40000000-0000-0000-0000-000000000003', '커플 반지 맞추기')$$,
  '세 번째 항목을 추가한다'
);

select results_eq(
  $$select author_id from public.todos where id = '40000000-0000-0000-0000-000000000001'$$,
  $$values ('00000000-0000-0000-0000-00000000000a'::uuid)$$,
  '작성자는 로그인한 사용자로 자동 기록된다'
);

select results_eq(
  $$select content from public.todos where id::text like '40000000-%' order by sort_order$$,
  $$values ('제주도 여행'), ('한강 피크닉'), ('커플 반지 맞추기')$$,
  '새 항목은 목록 맨 아래에 붙는다'
);

select throws_ok(
  $$insert into public.todos (content, author_id) values ('남의 이름으로', '00000000-0000-0000-0000-00000000000b')$$,
  '42501',
  null,
  '다른 사람을 작성자로 적을 수 없다'
);

select throws_ok(
  $$insert into public.todos (content, sort_order) values ('새치기', 0)$$,
  '42501',
  null,
  '추가할 때 순서 값을 직접 적을 수 없다(늘 맨 아래에 붙는다)'
);

select throws_ok(
  $$insert into public.todos (content) values ('')$$,
  '23514',
  null,
  '빈 내용은 저장하지 않는다'
);

select throws_ok(
  $$insert into public.todos (content) values (repeat('가', 101))$$,
  '23514',
  null,
  '100자를 넘는 내용은 저장하지 않는다'
);

-- 다른 멤버 b
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);

select results_eq(
  $$select count(*)::int from public.todos where id::text like '40000000-%'$$,
  $$values (3)$$,
  '다른 멤버도 같은 목록을 본다'
);

select throws_ok(
  $$update public.todos set author_id = '00000000-0000-0000-0000-00000000000b'
    where id = '40000000-0000-0000-0000-000000000001'$$,
  '42501',
  null,
  '고칠 때 작성자는 바꿀 수 없다'
);

select throws_ok(
  $$update public.todos set sort_order = 0 where id = '40000000-0000-0000-0000-000000000001'$$,
  '42501',
  null,
  '순서 값은 직접 고칠 수 없고 move_todo로만 바꾼다'
);

select lives_ok(
  $$update public.todos set content = '제주도 3박 4일' where id = '40000000-0000-0000-0000-000000000001'$$,
  '다른 멤버도 내용을 고친다'
);

select lives_ok(
  $$select public.move_todo('40000000-0000-0000-0000-000000000003', -1)$$,
  '다른 멤버도 순서를 바꾼다'
);

select results_eq(
  $$select content from public.todos where id::text like '40000000-%' order by sort_order$$,
  $$values ('제주도 3박 4일'), ('커플 반지 맞추기'), ('한강 피크닉')$$,
  '위로 옮기면 바로 위 항목과 자리를 바꾼다'
);

select lives_ok(
  $$select public.move_todo('40000000-0000-0000-0000-000000000001', -1)$$,
  '맨 위 항목을 위로 옮겨도 오류 없이 그대로 둔다'
);

-- 가운데 항목을 완료하면, 순서 바꾸기는 완료하지 않은 항목끼리만 한다
select lives_ok(
  $$update public.todos set completed_at = now() where id = '40000000-0000-0000-0000-000000000003'$$,
  '다른 멤버도 완료로 표시한다'
);

select lives_ok(
  $$select public.move_todo('40000000-0000-0000-0000-000000000002', -1)$$,
  '완료한 항목을 건너뛰고 옮긴다'
);

select results_eq(
  $$select content from public.todos where id::text like '40000000-%' and completed_at is null order by sort_order$$,
  $$values ('한강 피크닉'), ('제주도 3박 4일')$$,
  '완료하지 않은 항목 중 바로 위 항목과 자리를 바꾼다'
);

select throws_ok(
  $$select public.move_todo('40000000-0000-0000-0000-000000000003', 1)$$,
  'P0002',
  null,
  '완료한 항목은 옮기지 않는다'
);

select lives_ok(
  $$delete from public.todos where id = '40000000-0000-0000-0000-000000000003'$$,
  '다른 멤버도 항목을 지운다'
);

-- 허용목록 밖 사용자
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000ff","role":"authenticated"}', true);

select is_empty('select * from public.todos', '허용목록 밖 사용자에게는 목록이 보이지 않는다');

select throws_ok(
  $$insert into public.todos (content) values ('침입')$$,
  '42501',
  null,
  '허용목록 밖 사용자는 항목을 추가하지 못한다'
);

select throws_ok(
  $$select public.move_todo('40000000-0000-0000-0000-000000000001', 1)$$,
  '42501',
  null,
  '허용목록 밖 사용자는 순서를 바꾸지 못한다'
);

select * from finish();
rollback;

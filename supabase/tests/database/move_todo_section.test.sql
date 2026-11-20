-- 순서 바꾸기는 같은 구역(일정이 있는지 없는지) 안에서만 이웃을 찾는다(#497).
-- 목록 순서: 아직1 → 일정1 → 아직2 → 일정2 → 아직3 (사이사이에 일정 잡힌 항목이 끼어 있다)
begin;
create extension if not exists pgtap with schema extensions;

select plan(6);

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-00000000000a', 'a@move-todo-section.test', 'authenticated', 'authenticated');

insert into public.members (id, email, nickname) values
  ('00000000-0000-0000-0000-00000000000a', 'a@move-todo-section.test', 'A');

-- move_todo는 목록 전체에서 이웃을 찾으므로, 로컬 DB에 남은 항목이 끼어들지 않게 비우고 시작한다(끝에 rollback)
delete from public.todos;

-- 테스트 데이터는 RLS를 거치지 않고 미리 넣는다. 순서 값은 넣는 순서대로 커진다
insert into public.events (id, date, title, is_together, author_id) values
  ('50000000-0000-0000-0000-000000000001', '2026-11-28', '성수 팝업', true, '00000000-0000-0000-0000-00000000000a'),
  ('50000000-0000-0000-0000-000000000002', '2026-11-21', '전시', true, '00000000-0000-0000-0000-00000000000a');
insert into public.todos (id, content, author_id) values ('40000000-0000-0000-0000-000000000001', '아직1', '00000000-0000-0000-0000-00000000000a');
insert into public.todos (id, content, author_id, event_id) values ('40000000-0000-0000-0000-000000000002', '일정1', '00000000-0000-0000-0000-00000000000a', '50000000-0000-0000-0000-000000000001');
insert into public.todos (id, content, author_id) values ('40000000-0000-0000-0000-000000000003', '아직2', '00000000-0000-0000-0000-00000000000a');
insert into public.todos (id, content, author_id, event_id) values ('40000000-0000-0000-0000-000000000004', '일정2', '00000000-0000-0000-0000-00000000000a', '50000000-0000-0000-0000-000000000002');
insert into public.todos (id, content, author_id) values ('40000000-0000-0000-0000-000000000005', '아직3', '00000000-0000-0000-0000-00000000000a');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);

select lives_ok(
  $$select public.move_todo('40000000-0000-0000-0000-000000000003', -1)$$,
  '일정 없는 항목을 위로 옮긴다'
);

select results_eq(
  $$select content from public.todos where event_id is null order by sort_order$$,
  $$values ('아직2'), ('아직1'), ('아직3')$$,
  '사이에 낀 일정 잡힌 항목을 건너뛰고 바로 위의 일정 없는 항목과 자리를 바꾼다'
);

select lives_ok(
  $$select public.move_todo('40000000-0000-0000-0000-000000000001', 1)$$,
  '일정 없는 항목을 아래로 옮긴다'
);

select results_eq(
  $$select content from public.todos where event_id is null order by sort_order$$,
  $$values ('아직2'), ('아직3'), ('아직1')$$,
  '아래로 옮길 때도 일정 잡힌 항목을 건너뛴다'
);

select lives_ok(
  $$select public.move_todo('40000000-0000-0000-0000-000000000002', -1)$$,
  '일정 잡힌 항목의 위에 일정 잡힌 항목이 없으면 오류 없이 그대로 둔다'
);

select results_eq(
  $$select content from public.todos order by sort_order$$,
  $$values ('아직2'), ('일정1'), ('아직3'), ('일정2'), ('아직1')$$,
  '일정 잡힌 항목은 일정 없는 항목과 자리를 바꾸지 않는다'
);

select * from finish();
rollback;

-- 하고 싶은 것 '목록 보기' 설정(#497 PR ②): 사람마다 하나, 기본은 '구역으로', 본인 것만 set_todo_list_view로 바꾼다.
begin;
create extension if not exists pgtap with schema extensions;

select plan(9);

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-00000000000a', 'a@couple.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000000b', 'b@couple.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000ff', 'outsider@couple.test', 'authenticated', 'authenticated');

insert into public.members (id, email, nickname) values
  ('00000000-0000-0000-0000-00000000000a', 'a@couple.test', 'A'),
  ('00000000-0000-0000-0000-00000000000b', 'b@couple.test', 'B');

select results_eq(
  $$select todo_list_view from public.members where id = '00000000-0000-0000-0000-00000000000a'$$,
  $$values ('sections')$$,
  '바꾼 적이 없으면 구역으로 본다'
);

-- 비로그인(anon)
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok($$select public.set_todo_list_view('tabs')$$, '42501', null, '비로그인이면 목록 보기를 바꿀 권한이 없다');

-- 허용목록 밖 사용자
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000ff","role":"authenticated"}', true);
select throws_ok($$select public.set_todo_list_view('tabs')$$, '42501', null, '허용목록 밖 사용자는 목록 보기를 바꿀 수 없다');

-- 멤버 a
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
select lives_ok($$select public.set_todo_list_view('tabs')$$, '자기 목록 보기를 탭으로 바꾼다');
select results_eq(
  $$select id::text, todo_list_view from public.members order by id$$,
  $$values ('00000000-0000-0000-0000-00000000000a', 'tabs'), ('00000000-0000-0000-0000-00000000000b', 'sections')$$,
  '내 설정만 바뀌고 상대 설정은 그대로다'
);
select throws_ok($$select public.set_todo_list_view('grid')$$, '22023', null, '모르는 보기 이름은 거절한다');
select throws_ok($$select public.set_todo_list_view(null)$$, '22023', null, '빈 값은 거절한다');
select throws_ok(
  $$update public.members set todo_list_view = 'tabs' where id = '00000000-0000-0000-0000-00000000000b'$$,
  '42501', null, '칸을 직접 고칠 수 없다(상대 설정도 바꾸지 못한다)'
);

-- 다시 구역으로
select public.set_todo_list_view('sections');
select results_eq(
  $$select todo_list_view from public.members where id = '00000000-0000-0000-0000-00000000000a'$$,
  $$values ('sections')$$,
  '구역으로 되돌릴 수 있다'
);

select * from finish();
rollback;

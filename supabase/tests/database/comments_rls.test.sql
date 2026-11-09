-- 기록 댓글(comments): 허용된 두 사람은 서로의 기록에 댓글을 남기고 함께 읽는다.
-- 댓글은 고칠 수 없고, 지우는 것은 쓴 사람만 한다. 비로그인·허용목록 밖 사용자는 읽지도 쓰지도 못한다.
begin;
create extension if not exists pgtap with schema extensions;

select plan(21);

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-00000000000a', 'a@comments.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000000b', 'b@comments.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000ff', 'outsider@comments.test', 'authenticated', 'authenticated');

insert into public.members (id, email, nickname) values
  ('00000000-0000-0000-0000-00000000000a', 'a@comments.test', 'A'),
  ('00000000-0000-0000-0000-00000000000b', 'b@comments.test', 'B');

insert into public.dates (id, date, title, author_id) values
  ('50000000-0000-0000-0000-000000000001', '2026-11-01', '첫 데이트', '00000000-0000-0000-0000-00000000000a'),
  ('50000000-0000-0000-0000-000000000002', '2026-11-02', '두 번째 데이트', '00000000-0000-0000-0000-00000000000a');

select has_table('public', 'comments', '기록 댓글 테이블이 있다');

-- 비로그인(anon)
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select throws_ok('select * from public.comments', '42501', null, '비로그인이면 댓글을 조회할 권한이 없다');

-- a가 자기 기록에 댓글을 남긴다
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);

select lives_ok(
  $$insert into public.comments (id, date_id, content)
    values ('60000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', '또 가자')$$,
  '허용된 사용자는 기록에 댓글을 남긴다'
);

select results_eq(
  $$select author_id from public.comments where id = '60000000-0000-0000-0000-000000000001'$$,
  $$values ('00000000-0000-0000-0000-00000000000a'::uuid)$$,
  '작성자는 로그인한 사용자로 자동 기록된다'
);

select throws_ok(
  $$insert into public.comments (date_id, content, author_id)
    values ('50000000-0000-0000-0000-000000000001', '남의 이름으로', '00000000-0000-0000-0000-00000000000b')$$,
  '42501',
  null,
  '다른 사람을 작성자로 적을 수 없다'
);

select throws_ok(
  $$insert into public.comments (date_id, content, created_at)
    values ('50000000-0000-0000-0000-000000000001', '옛날 댓글', '2020-01-01')$$,
  '42501',
  null,
  '남긴 시각을 직접 적을 수 없다'
);

select throws_ok(
  $$insert into public.comments (date_id, content) values ('50000000-0000-0000-0000-000000000001', '')$$,
  '23514',
  null,
  '빈 댓글은 저장하지 않는다'
);

select throws_ok(
  $$insert into public.comments (date_id, content) values ('50000000-0000-0000-0000-000000000001', repeat('가', 201))$$,
  '23514',
  null,
  '200자를 넘는 댓글은 저장하지 않는다'
);

select lives_ok(
  $$insert into public.comments (date_id, content) values ('50000000-0000-0000-0000-000000000002', repeat('가', 200))$$,
  '200자 댓글은 저장한다'
);

select throws_ok(
  $$insert into public.comments (date_id, content) values ('50000000-0000-0000-0000-0000000000ff', '없는 기록')$$,
  '23503',
  null,
  '없는 기록에는 댓글을 남기지 않는다'
);

-- 다른 멤버 b
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);

select results_eq(
  $$select content from public.comments where date_id = '50000000-0000-0000-0000-000000000001'$$,
  $$values ('또 가자')$$,
  '다른 멤버도 댓글을 본다'
);

select lives_ok(
  $$insert into public.comments (id, date_id, content)
    values ('60000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000000001', '좋아')$$,
  '다른 멤버도 상대의 기록에 댓글을 남긴다'
);

select throws_ok(
  $$update public.comments set content = '고친 댓글' where id = '60000000-0000-0000-0000-000000000002'$$,
  '42501',
  null,
  '댓글은 쓴 사람도 고칠 수 없다'
);

-- TRUNCATE는 RLS를 거치지 않아 쓴 사람만 지우는 규칙을 건너뛴다
select throws_ok(
  'truncate public.comments',
  '42501',
  null,
  '로그인한 사용자도 댓글을 한꺼번에 비우지 못한다'
);

-- RLS는 지울 수 없는 행을 오류 없이 건너뛰므로, 지운 뒤에도 남아 있는지로 확인한다
delete from public.comments where id = '60000000-0000-0000-0000-000000000001';

select results_eq(
  $$select count(*)::int from public.comments where id = '60000000-0000-0000-0000-000000000001'$$,
  $$values (1)$$,
  '상대가 쓴 댓글은 지우지 못한다'
);

select lives_ok(
  $$delete from public.comments where id = '60000000-0000-0000-0000-000000000002'$$,
  '내가 쓴 댓글은 지운다'
);

select is_empty(
  $$select 1 from public.comments where id = '60000000-0000-0000-0000-000000000002'$$,
  '지운 댓글은 남지 않는다'
);

-- 허용목록 밖 사용자
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000ff","role":"authenticated"}', true);

select is_empty('select * from public.comments', '허용목록 밖 사용자에게는 댓글이 보이지 않는다');

select throws_ok(
  $$insert into public.comments (date_id, content) values ('50000000-0000-0000-0000-000000000001', '침입')$$,
  '42501',
  null,
  '허용목록 밖 사용자는 댓글을 남기지 못한다'
);

-- 기록을 지우면 댓글도 함께 지운다
reset role;
delete from public.dates where id = '50000000-0000-0000-0000-000000000001';

select is_empty(
  $$select 1 from public.comments where date_id = '50000000-0000-0000-0000-000000000001'$$,
  '기록을 지우면 그 기록의 댓글도 지워진다'
);

select results_eq(
  $$select count(*)::int from public.comments where date_id = '50000000-0000-0000-0000-000000000002'$$,
  $$values (1)$$,
  '다른 기록의 댓글은 그대로 둔다'
);

select * from finish();
rollback;

-- 닉네임 변경(#133): 로그인한 멤버는 자기 행의 닉네임 칸만 바꾼다.
-- members는 로그인 허용목록이라 다른 사람 행, 이메일, 행 추가·삭제는 앱에서 건드릴 수 없어야 한다.
begin;
create extension if not exists pgtap with schema extensions;

select plan(20);

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-00000000000a', 'a@couple.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000000b', 'b@couple.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000ff', 'outsider@couple.test', 'authenticated', 'authenticated');

insert into public.members (id, email, nickname) values
  ('00000000-0000-0000-0000-00000000000a', 'a@couple.test', 'A'),
  ('00000000-0000-0000-0000-00000000000b', 'b@couple.test', 'B');

-- 비로그인(anon)
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select throws_ok(
  $$update public.members set nickname = '침입' where id = '00000000-0000-0000-0000-00000000000a'$$,
  '42501',
  null,
  '비로그인이면 닉네임을 바꿀 권한이 없다'
);

-- 허용목록 밖 사용자
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000ff","role":"authenticated"}', true);

select is_empty(
  $$with changed as (
      update public.members set nickname = '침입' where id = '00000000-0000-0000-0000-00000000000a' returning 1
    ) select * from changed$$,
  '허용목록 밖 사용자는 멤버의 닉네임을 바꾸지 못한다'
);

-- 멤버 a
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);

select results_eq(
  $$with changed as (
      update public.members set nickname = '새이름' where id = '00000000-0000-0000-0000-00000000000a' returning nickname
    ) select nickname from changed$$,
  $$values ('새이름')$$,
  '자기 닉네임을 바꾸면 바뀐 값을 돌려받는다'
);

select results_eq(
  $$select nickname from public.members where id = '00000000-0000-0000-0000-00000000000a'$$,
  $$values ('새이름')$$,
  '바꾼 닉네임이 저장된다'
);

select is_empty(
  $$with changed as (
      update public.members set nickname = '침입' where id = '00000000-0000-0000-0000-00000000000b' returning 1
    ) select * from changed$$,
  '다른 사람의 닉네임은 바뀌지 않는다'
);

select throws_ok(
  $$update public.members set email = 'evil@couple.test' where id = '00000000-0000-0000-0000-00000000000a'$$,
  '42501',
  null,
  '자기 행이어도 이메일은 바꿀 수 없다'
);

select throws_ok(
  $$update public.members set id = '00000000-0000-0000-0000-0000000000ff' where id = '00000000-0000-0000-0000-00000000000a'$$,
  '42501',
  null,
  '자기 행이어도 id는 바꿀 수 없다'
);

select throws_ok(
  $$update public.members set created_at = now() where id = '00000000-0000-0000-0000-00000000000a'$$,
  '42501',
  null,
  '자기 행이어도 만든 시각은 바꿀 수 없다'
);

select throws_ok(
  $$update public.members set nickname = '같이', email = 'evil@couple.test' where id = '00000000-0000-0000-0000-00000000000a'$$,
  '42501',
  null,
  '닉네임과 이메일을 함께 바꾸는 요청도 막는다'
);

select throws_ok(
  $$insert into public.members (id, email, nickname)
    values ('00000000-0000-0000-0000-0000000000ff', 'outsider@couple.test', '침입')$$,
  '42501',
  null,
  '멤버도 허용목록에 사람을 추가할 수 없다'
);

select is_empty(
  $$with removed as (
      delete from public.members where id = '00000000-0000-0000-0000-00000000000b' returning 1
    ) select * from removed$$,
  '멤버도 다른 사람을 허용목록에서 지울 수 없다'
);

select is_empty(
  $$with removed as (
      delete from public.members where id = '00000000-0000-0000-0000-00000000000a' returning 1
    ) select * from removed$$,
  '멤버도 자신을 허용목록에서 지울 수 없다'
);

-- 값 검사: 화면을 거치지 않은 요청도 빈 값과 앞뒤 공백은 저장되지 않는다
select throws_ok(
  $$update public.members set nickname = '' where id = '00000000-0000-0000-0000-00000000000a'$$,
  -- 보이는 글자가 없어 정책(#170)이 글자 수 제약보다 먼저 막는다
  '42501',
  null,
  '빈 닉네임은 저장되지 않는다'
);

select throws_ok(
  $$update public.members set nickname = '   ' where id = '00000000-0000-0000-0000-00000000000a'$$,
  '42501',
  null,
  '공백만 있는 닉네임은 저장되지 않는다'
);

select throws_ok(
  $$update public.members set nickname = ' 앞공백' where id = '00000000-0000-0000-0000-00000000000a'$$,
  '42501',
  null,
  '앞에 공백이 있는 닉네임은 저장되지 않는다'
);

select throws_ok(
  $$update public.members set nickname = E'뒤공백\t' where id = '00000000-0000-0000-0000-00000000000a'$$,
  '42501',
  null,
  '뒤에 공백 문자가 있는 닉네임은 저장되지 않는다'
);

select lives_ok(
  $$update public.members set nickname = '가운데 공백' where id = '00000000-0000-0000-0000-00000000000a'$$,
  '가운데 공백은 저장된다'
);

select throws_ok(
  $$update public.members set nickname = repeat('가', 21) where id = '00000000-0000-0000-0000-00000000000a'$$,
  '23514',
  null,
  '20자를 넘는 닉네임은 저장되지 않는다'
);

-- 6자 제한은 화면 글자 단위라 DB에서 셀 수 없다. 합친 이모지 여러 개가 들어가도록 DB는 예전 범위를 유지한다
select lives_ok(
  $$update public.members set nickname = repeat('가', 20) where id = '00000000-0000-0000-0000-00000000000a'$$,
  '예전 닉네임 범위인 20자까지는 DB가 막지 않는다'
);

-- 멤버 b: a의 변경을 함께 본다
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);

select results_eq(
  $$select nickname from public.members where id = '00000000-0000-0000-0000-00000000000b'$$,
  $$values ('B')$$,
  '다른 사람의 시도가 있어도 b의 닉네임은 그대로다'
);

select * from finish();
rollback;

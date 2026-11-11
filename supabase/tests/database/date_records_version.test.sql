-- 기록 판 번호(#274): 그리드에 보이는 내용이나 기록 구성이 바뀔 때만 값이 바뀌고, 회원만 실행할 수 있는지 확인한다.
-- 로컬 DB에 다른 기록이 남아 있어도 같은 트랜잭션 안에서 앞뒤 값만 비교하므로 흔들리지 않는다.
begin;
create extension if not exists pgtap with schema extensions;

select plan(10);

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-00000000000a', 'a@version.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000ff', 'outsider@version.test', 'authenticated', 'authenticated');

insert into public.members (id, email, nickname) values
  ('00000000-0000-0000-0000-00000000000a', 'a@version.test', 'A');

insert into public.dates (id, date, title, tags, author_id) values
  ('72000000-0000-0000-0000-000000000001', '2026-11-03', 'pgv첫째', array['pgv'], '00000000-0000-0000-0000-00000000000a'),
  ('72000000-0000-0000-0000-000000000002', '2026-11-02', 'pgv둘째', '{}', '00000000-0000-0000-0000-00000000000a');

select has_function('public', 'date_records_version', array[]::text[], '기록 판 번호 함수가 있다');
select ok(
  not has_function_privilege('anon', 'public.date_records_version()', 'execute'),
  '비로그인은 기록 판 번호를 읽을 수 없다'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);

create temporary table seen (step text primary key, version text);
insert into seen values ('start', public.date_records_version());

select is(public.date_records_version(), (select version from seen where step = 'start'), '아무것도 바뀌지 않으면 같은 값이다');

-- 그리드에 보이지 않는 칸(정리 글)만 바뀌어도 판 번호(revision)가 바뀌면 찾기 결과가 달라질 수 있어 값이 바뀐다
reset role;
update public.dates set revision = gen_random_uuid() where id = '72000000-0000-0000-0000-000000000002';
set local role authenticated;
insert into seen values ('revision', public.date_records_version());
select isnt((select version from seen where step = 'revision'), (select version from seen where step = 'start'), '판 번호가 바뀌면 값이 바뀐다');

reset role;
update public.dates set title = 'pgv둘째 고침' where id = '72000000-0000-0000-0000-000000000002';
set local role authenticated;
insert into seen values ('title', public.date_records_version());
select isnt((select version from seen where step = 'title'), (select version from seen where step = 'revision'), '판 번호 없이 제목만 바뀌어도 값이 바뀐다');

reset role;
update public.dates set tags = array['pgv', '새태그'] where id = '72000000-0000-0000-0000-000000000001';
set local role authenticated;
insert into seen values ('tags', public.date_records_version());
select isnt((select version from seen where step = 'tags'), (select version from seen where step = 'title'), '태그가 바뀌면 값이 바뀐다');

-- 끝 날짜가 비어 있다가 생기는 것도 구분한다(빈 칸을 건너뛰어 이어 붙이면 앞뒤 칸과 섞인다)
reset role;
update public.dates set end_date = '2026-11-04' where id = '72000000-0000-0000-0000-000000000001';
set local role authenticated;
insert into seen values ('end_date', public.date_records_version());
select isnt((select version from seen where step = 'end_date'), (select version from seen where step = 'tags'), '끝 날짜가 생기면 값이 바뀐다');

reset role;
insert into public.dates (date, title, author_id) values ('2026-11-01', 'pgv셋째', '00000000-0000-0000-0000-00000000000a');
set local role authenticated;
insert into seen values ('insert', public.date_records_version());
select isnt((select version from seen where step = 'insert'), (select version from seen where step = 'end_date'), '기록을 더하면 값이 바뀐다');

reset role;
delete from public.dates where id = '72000000-0000-0000-0000-000000000002';
set local role authenticated;
select isnt(public.date_records_version(), (select version from seen where step = 'insert'), '기록을 지우면 값이 바뀐다');

-- 회원이 아니면 RLS가 기록을 하나도 보여 주지 않아 기록이 없을 때의 값과 같다
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000ff","role":"authenticated"}', true);
select is(public.date_records_version(), md5(''), '회원이 아니면 기록이 없는 것과 같은 값이다');

select * from finish();
rollback;

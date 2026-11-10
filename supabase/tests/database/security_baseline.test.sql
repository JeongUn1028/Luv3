-- 표·함수·정책 전체를 훑어, 새 표나 함수가 권한 기본 규칙을 빠뜨리면 실패한다(#255).
-- 표마다 쓴 권한 테스트는 그 표만 보므로, 여기서는 카탈로그로 모두를 한 번에 본다.
-- 회원이 어떤 칸을 넣고 고칠 수 있는지 같은 표마다 다른 규칙은 각 표의 테스트가 맡는다.
begin;
create extension if not exists pgtap with schema extensions;

select plan(16);

-- 카탈로그 전수 검사
select is_empty(
  $$select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity$$,
  '모든 public 표는 RLS가 켜져 있다'
);
select is_empty(
  $$select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm', 'f')
      and has_table_privilege('anon', c.oid, 'select, insert, update, delete, truncate, references, trigger')$$,
  '비로그인은 어떤 public 표·뷰에도 권한이 없다'
);
-- TRUNCATE는 RLS를 건너뛰고, references·trigger는 앱이 쓰지 않는다
select is_empty(
  $$select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm', 'f')
      and has_table_privilege('authenticated', c.oid, 'truncate, references, trigger')$$,
  '회원은 어떤 public 표·뷰에도 truncate·references·trigger 권한이 없다'
);
-- 시퀀스 권한도 RLS를 거치지 않는다. 회원은 기본값(nextval)에 필요한 usage만 갖는다
select is_empty(
  $$select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      -- 조건 순서가 바뀌어 시퀀스가 아닌 것을 넘기면 오류라 case로 감싼다
      and case when c.relkind = 'S' then has_sequence_privilege('anon', c.oid, 'usage, select, update') else false end$$,
  '비로그인은 어떤 public 시퀀스에도 권한이 없다'
);
select is_empty(
  $$select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and case when c.relkind = 'S' then has_sequence_privilege('authenticated', c.oid, 'select, update') else false end$$,
  '회원은 public 시퀀스의 값을 읽거나 바꿀 수 없다'
);
-- 표·시퀀스를 새로 만들 때 붙는 기본 권한에도 위 권한이 없어야, 새 표가 같은 구멍으로 시작하지 않는다
select is_empty(
  $$select d.defaclobjtype::text || ' ' || a.grantee::regrole::text || ' ' || a.privilege_type
    from pg_default_acl d
    join pg_namespace n on n.oid = d.defaclnamespace
    cross join lateral aclexplode(d.defaclacl) a
    where d.defaclrole = 'postgres'::regrole and n.nspname = 'public'
      and (
        (d.defaclobjtype = 'r' and a.grantee = 'authenticated'::regrole and a.privilege_type in ('TRUNCATE', 'REFERENCES', 'TRIGGER'))
        or (d.defaclobjtype in ('r', 'S') and a.grantee = 'anon'::regrole)
        or (d.defaclobjtype = 'S' and a.grantee = 'authenticated'::regrole and a.privilege_type in ('SELECT', 'UPDATE'))
      )$$,
  'postgres가 public에 새로 만드는 표·시퀀스에는 위 권한이 기본으로 붙지 않는다'
);
-- 빈 search_path만 허용한다. public 등을 넣으면 다른 역할이 만든 같은 이름 객체로 바꿔치기될 수 있다
select is_empty(
  $$select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
      and not exists (select 1 from unnest(p.proconfig) setting where setting = 'search_path=""')$$,
  '모든 public 함수는 search_path를 빈 값으로 고정한다'
);
-- 트리거 함수는 트리거로만 실행되어 직접 부를 수 없으므로 뺀다
select results_eq(
  $$select p.proname::text collate "default" from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prorettype <> 'trigger'::regtype
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
      and has_function_privilege('anon', p.oid, 'execute')
    order by 1$$,
  $$values ('keepalive')$$,
  '비로그인이 실행할 수 있는 public 함수는 데이터를 읽지 않는 keepalive뿐이다'
);
select is_empty(
  $$select schemaname || '.' || tablename || ' ' || policyname from pg_policies
    where schemaname in ('public', 'storage') and roles && array['public', 'anon']::name[]$$,
  'public 표와 Storage 정책은 비로그인·모든 역할에 열지 않는다'
);
select is_empty(
  $$select policyname from pg_policies where schemaname = 'storage' and cmd in ('UPDATE', 'ALL')$$,
  'Storage 파일을 덮어쓰거나 옮기는 정책은 없다'
);

-- 준비: 허용된 사람 a, 허용목록 밖의 사용자(outsider), a의 반복 일정·건너뛴 날·기록·album 파일
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-00000000000a', 'a@baseline.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000ff', 'outsider@baseline.test', 'authenticated', 'authenticated');

insert into public.members (id, email, nickname) values
  ('00000000-0000-0000-0000-00000000000a', 'a@baseline.test', 'A');

insert into public.events (id, date, title, is_together, author_id, repeat_rule) values
  ('30000000-0000-0000-0000-000000000001', '2026-11-01', '운동', true, '00000000-0000-0000-0000-00000000000a', 'weekly');

insert into public.event_exceptions (event_id, date) values
  ('30000000-0000-0000-0000-000000000001', '2026-11-08');

insert into public.dates (id, date, title, author_id) values
  ('10000000-0000-0000-0000-000000000001', '2026-11-01', '산책', '00000000-0000-0000-0000-00000000000a');

insert into storage.objects (bucket_id, name, owner) values
  ('album', '10000000-0000-0000-0000-000000000001/20000000-0000-0000-0000-000000000001.jpg', '00000000-0000-0000-0000-00000000000a');

-- Storage는 표에서 바로 지우는 것을 트리거로 막고, Storage API가 이 값을 켠 뒤 지운다. API와 같은 조건에서 RLS를 본다
select set_config('storage.allow_delete_query', 'true', true);

-- 허용목록 밖의 사용자
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000ff","role":"authenticated"}', true);

select throws_ok(
  $$insert into public.event_exceptions (event_id, date) values ('30000000-0000-0000-0000-000000000001', '2026-11-15')$$,
  '42501', null, '허용목록 밖의 사용자는 반복 일정의 날을 건너뛸 수 없다'
);
select is_empty(
  $$with removed as (
      delete from public.event_exceptions where event_id = '30000000-0000-0000-0000-000000000001' returning date
    ) select date from removed$$,
  '허용목록 밖의 사용자는 건너뛴 날을 되살릴 수 없다'
);
select is_empty(
  $$with removed as (
      delete from storage.objects
      where bucket_id = 'album' and name = '10000000-0000-0000-0000-000000000001/20000000-0000-0000-0000-000000000001.jpg'
      returning name
    ) select name from removed$$,
  '허용목록 밖의 사용자는 album 버킷의 사진을 지울 수 없다'
);

-- 표 소유자로 돌아와, 위 시도가 실제로 아무것도 바꾸지 않았는지 본다
reset role;
select is(
  (select count(*)::int from public.event_exceptions where event_id = '30000000-0000-0000-0000-000000000001')
    + (select count(*)::int from storage.objects
       where bucket_id = 'album' and name = '10000000-0000-0000-0000-000000000001/20000000-0000-0000-0000-000000000001.jpg'),
  2,
  '허용목록 밖의 사용자가 시도한 뒤에도 건너뛴 날과 사진 파일이 그대로 남아 있다'
);

-- 같은 조건에서 회원은 지울 수 있어야, 위 결과가 지우기 자체가 막힌 탓이 아님을 안다
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);

select results_eq(
  $$with removed as (
      delete from public.event_exceptions where event_id = '30000000-0000-0000-0000-000000000001' returning date
    ) select date from removed$$,
  $$values ('2026-11-08'::date)$$,
  '회원은 건너뛴 날을 되살린다'
);
select results_eq(
  $$with removed as (
      delete from storage.objects
      where bucket_id = 'album' and name = '10000000-0000-0000-0000-000000000001/20000000-0000-0000-0000-000000000001.jpg'
      returning name
    ) select name::text from removed$$,
  $$values ('10000000-0000-0000-0000-000000000001/20000000-0000-0000-0000-000000000001.jpg')$$,
  '회원은 album 버킷의 사진을 지운다'
);

select * from finish();
rollback;

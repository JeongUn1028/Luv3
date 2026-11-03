-- 무료 플랜 일시정지를 막는 keepalive(): 비로그인으로도 부를 수 있지만 DB 시각만 돌려주고,
-- 이 함수가 생겨도 비로그인은 여전히 테이블을 읽지 못하는지 확인한다.
begin;
create extension if not exists pgtap with schema extensions;

select plan(5);

select has_function('public', 'keepalive', array[]::text[], 'keepalive 함수가 있다');
select function_returns('public', 'keepalive', array[]::text[], 'timestamp with time zone', 'keepalive는 시각을 돌려준다');

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select lives_ok('select public.keepalive()', '비로그인도 keepalive를 부를 수 있다');

-- now()는 트랜잭션 시작 시각으로 고정되므로, 함수가 DB 시각을 그대로 돌려주면 정확히 같다
select is(public.keepalive(), now(), 'keepalive는 DB 시각만 돌려준다');

select throws_ok('select * from public.members', '42501', null, 'keepalive가 있어도 비로그인은 허용목록을 읽지 못한다');

select * from finish();
rollback;

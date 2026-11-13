-- 웹 푸시 구독(push_subscriptions, #363): 각자 자기 기기의 구독만 읽고 지운다.
-- 저장은 save_push_subscription으로만 하고, 같은 기기(endpoint)를 다른 사람이 저장하면 주인이 바뀐다.
begin;
create extension if not exists pgtap with schema extensions;

select plan(17);

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-00000000000a', 'a@push.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000000b', 'b@push.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000ff', 'outsider@push.test', 'authenticated', 'authenticated');

insert into public.members (id, email, nickname) values
  ('00000000-0000-0000-0000-00000000000a', 'a@push.test', 'A'),
  ('00000000-0000-0000-0000-00000000000b', 'b@push.test', 'B');

select has_table('public', 'push_subscriptions', '웹 푸시 구독 테이블이 있다');

-- 비로그인(anon)
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select throws_ok('select * from public.push_subscriptions', '42501', null, '비로그인이면 구독을 조회할 권한이 없다');
select throws_ok(
  $$select public.save_push_subscription('https://push.example/anon', 'key', 'auth')$$,
  '42501', null, '비로그인이면 구독을 저장할 수 없다'
);

-- 허용목록 밖의 사용자
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000ff","role":"authenticated"}', true);

select throws_ok(
  $$select public.save_push_subscription('https://push.example/outsider', 'key', 'auth')$$,
  '42501', null, '허용목록 밖의 사용자는 구독을 저장할 수 없다'
);

-- a가 자기 기기 두 대를 켠다
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);

select lives_ok(
  $$select public.save_push_subscription('https://push.example/phone', 'key-1', 'auth-1')$$,
  '회원은 이 기기의 구독을 저장한다'
);
select lives_ok(
  $$select public.save_push_subscription('https://push.example/phone', 'key-2', 'auth-2')$$,
  '같은 기기를 다시 저장해도 오류가 나지 않는다'
);
select public.save_push_subscription('https://push.example/tablet', 'key-3', 'auth-3');

select results_eq(
  $$select endpoint, p256dh, auth, member_id from public.push_subscriptions order by endpoint$$,
  $$values
    ('https://push.example/phone', 'key-2', 'auth-2', '00000000-0000-0000-0000-00000000000a'::uuid),
    ('https://push.example/tablet', 'key-3', 'auth-3', '00000000-0000-0000-0000-00000000000a'::uuid)$$,
  '같은 기기는 한 행으로 남고 키는 마지막 값으로 바뀐다'
);

select throws_ok(
  $$insert into public.push_subscriptions (endpoint, p256dh, auth) values ('https://push.example/direct', 'key', 'auth')$$,
  '42501', null, '표에 직접 넣을 수 없다'
);
select throws_ok(
  $$update public.push_subscriptions set p256dh = 'changed'$$,
  '42501', null, '구독을 직접 고칠 수 없다'
);
select throws_ok(
  $$select public.save_push_subscription('http://push.example/plain', 'key', 'auth')$$,
  '23514', null, 'https가 아닌 주소는 저장하지 않는다'
);
select throws_ok(
  $$select public.save_push_subscription('https://push.example/empty-key', '', 'auth')$$,
  '23514', null, '빈 키는 저장하지 않는다'
);

-- 다른 멤버 b
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);

select is_empty($$select endpoint from public.push_subscriptions$$, '상대의 구독은 보이지 않는다');
select is_empty(
  $$with removed as (delete from public.push_subscriptions returning endpoint) select endpoint from removed$$,
  '상대의 구독은 지울 수 없다'
);

-- a가 쓰던 태블릿에 b가 로그인해 알림을 켠다
select public.save_push_subscription('https://push.example/tablet', 'key-4', 'auth-4');

select results_eq(
  $$select endpoint, member_id from public.push_subscriptions$$,
  $$values ('https://push.example/tablet', '00000000-0000-0000-0000-00000000000b'::uuid)$$,
  '같은 기기를 다른 사람이 저장하면 그 사람의 구독이 된다'
);

-- 다시 a
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);

select results_eq(
  $$select endpoint from public.push_subscriptions$$,
  $$values ('https://push.example/phone')$$,
  '주인이 바뀐 기기는 원래 주인에게서 빠진다'
);
select results_eq(
  $$with removed as (delete from public.push_subscriptions where endpoint = 'https://push.example/phone' returning endpoint)
    select endpoint from removed$$,
  $$values ('https://push.example/phone')$$,
  '자기 기기의 구독은 지운다'
);

reset role;
select results_eq(
  $$select endpoint from public.push_subscriptions$$,
  $$values ('https://push.example/tablet')$$,
  'b의 구독만 남는다'
);

select * from finish();
rollback;

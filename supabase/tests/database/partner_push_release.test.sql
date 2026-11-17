-- 상대 알림 되돌리기(#409): 한 기기도 보내지 못했을 때 release_partner_push가 보낸 기록을 지우고 올린 숫자를 내려,
-- 같은 글로 다시 부탁하면 다시 보낼 수 있는지, claim이 준 되돌리기 표 없이는 되돌릴 수 없는지 확인한다.
begin;
create extension if not exists pgtap with schema extensions;

select plan(11);

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-00000000000a', 'a@push-release.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000000b', 'b@push-release.test', 'authenticated', 'authenticated');

-- a가 알림을 부탁하는 사람, b는 알림을 켠 상대
insert into public.members (id, email, nickname) values
  ('00000000-0000-0000-0000-00000000000a', 'a@push-release.test', 'A'),
  ('00000000-0000-0000-0000-00000000000b', 'b@push-release.test', 'B');

insert into public.push_subscriptions (member_id, endpoint, p256dh, auth) values
  ('00000000-0000-0000-0000-00000000000b', 'https://web.push.apple.com/b-phone', 'key-1', 'auth-1');

insert into public.dates (id, date, title, author_id, created_at) values
  ('10000000-0000-0000-0000-000000000001', '2026-11-17', '방금 쓴 기록', '00000000-0000-0000-0000-00000000000a', now());

create temporary table claimed (token uuid) on commit drop;
grant all on claimed to service_role;

-- 비로그인(anon)
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok(
  $$select public.release_partner_push('record', '10000000-0000-0000-0000-000000000001', gen_random_uuid())$$,
  '42501', null, '비로그인이면 되돌릴 수 없다'
);

-- 회원도 직접 부를 수 없다(#412). 서버 경로만 부른다
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
select throws_ok(
  $$select public.release_partner_push('record', '10000000-0000-0000-0000-000000000001', gen_random_uuid())$$,
  '42501', null, '회원도 되돌리기 함수를 직접 부를 수 없다'
);

-- 서버 경로가 a의 부탁을 확인해 b의 숫자가 1이 됐다
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
insert into claimed select (public.claim_partner_push('00000000-0000-0000-0000-00000000000a', 'record', '10000000-0000-0000-0000-000000000001') ->> 'release_token')::uuid;
select isnt((select token from claimed), null, '확인을 통과하면 되돌리기 표를 함께 돌려준다');

-- 표 없이(다른 값으로) 되돌리려 한다: 보낸 알림을 지우고 다시 보내는 것을 막는다
select public.release_partner_push('record', '10000000-0000-0000-0000-000000000001', gen_random_uuid());
select is(
  public.claim_partner_push('00000000-0000-0000-0000-00000000000a', 'record', '10000000-0000-0000-0000-000000000001') ->> 'status',
  'already-sent',
  '되돌리기 표가 맞지 않으면 보낸 기록을 지우지 않는다'
);
reset role;
select is(
  (select badge_count from public.push_settings where member_id = '00000000-0000-0000-0000-00000000000b'),
  1,
  '되돌리기 표가 맞지 않으면 숫자도 바꾸지 않는다'
);
select is(
  (select recipient_ids from public.push_sent where target_id = '10000000-0000-0000-0000-000000000001'),
  array['00000000-0000-0000-0000-00000000000b']::uuid[],
  '숫자를 올린 사람을 보낸 기록에 적어 둔다'
);

-- 표로 되돌린다
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select lives_ok(
  $$select public.release_partner_push('record', '10000000-0000-0000-0000-000000000001', (select token from claimed))$$,
  '되돌리기 표가 맞으면 되돌린다'
);
reset role;
select is(
  (select badge_count from public.push_settings where member_id = '00000000-0000-0000-0000-00000000000b'),
  0,
  '되돌리면 올린 숫자를 내린다'
);
select is(
  (select count(*)::int from public.push_sent where target_id = '10000000-0000-0000-0000-000000000001'),
  0,
  '되돌리면 보낸 기록을 지운다'
);

-- 같은 표로 다시 되돌려도 숫자를 더 내리지 않는다
update public.push_settings set badge_count = 5 where member_id = '00000000-0000-0000-0000-00000000000b';
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select public.release_partner_push('record', '10000000-0000-0000-0000-000000000001', (select token from claimed));
select is(
  public.claim_partner_push('00000000-0000-0000-0000-00000000000a', 'record', '10000000-0000-0000-0000-000000000001') ->> 'status',
  'ready',
  '되돌린 글은 다시 부탁하면 다시 보낸다'
);
reset role;
select is(
  (select badge_count from public.push_settings where member_id = '00000000-0000-0000-0000-00000000000b'),
  6,
  '한 번 되돌린 표로는 다시 내리지 않는다(다시 부탁해 1 오른 숫자만 남는다)'
);

select * from finish();
rollback;

-- 상대 활동 알림(#364): 서버 경로만 부르는(#412) claim_partner_push가 부탁을 확인하고 받을 사람의 구독과 숫자를 돌려주는지,
-- 숫자 지우기(clear_push_badge)와 사라진 구독 지우기(delete_push_subscriptions)를 확인한다.
begin;
create extension if not exists pgtap with schema extensions;

select plan(30);

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-00000000000a', 'a@partner-push.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000000b', 'b@partner-push.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000000c', 'c@partner-push.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000ff', 'outsider@partner-push.test', 'authenticated', 'authenticated');

-- a가 알림을 부탁하는 사람, b는 알림을 켠 상대, c는 알림을 켠 기기가 없는 회원
insert into public.members (id, email, nickname) values
  ('00000000-0000-0000-0000-00000000000a', 'a@partner-push.test', 'A'),
  ('00000000-0000-0000-0000-00000000000b', 'b@partner-push.test', 'B'),
  ('00000000-0000-0000-0000-00000000000c', 'c@partner-push.test', 'C');

insert into public.push_subscriptions (member_id, endpoint, p256dh, auth) values
  ('00000000-0000-0000-0000-00000000000b', 'https://web.push.apple.com/b-phone', 'key-1', 'auth-1'),
  ('00000000-0000-0000-0000-00000000000b', 'https://web.push.apple.com/b-tablet', 'key-2', 'auth-2'),
  ('00000000-0000-0000-0000-00000000000a', 'https://web.push.apple.com/a-phone', 'key-3', 'auth-3');

insert into public.dates (id, date, title, author_id, created_at) values
  ('10000000-0000-0000-0000-000000000001', '2026-11-12', '방금 쓴 기록', '00000000-0000-0000-0000-00000000000a', now()),
  ('10000000-0000-0000-0000-000000000002', '2026-11-01', '오래된 기록', '00000000-0000-0000-0000-00000000000a', now() - interval '11 minutes'),
  ('10000000-0000-0000-0000-000000000003', '2026-11-12', 'B의 기록', '00000000-0000-0000-0000-00000000000b', now());

insert into public.comments (id, date_id, content, author_id) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000003', '좋았어', '00000000-0000-0000-0000-00000000000a');

insert into public.events (id, date, title, author_id, repeat_rule) values
  ('30000000-0000-0000-0000-000000000001', '2026-11-20', '매주 운동', '00000000-0000-0000-0000-00000000000a', 'weekly');
insert into public.events (id, date, title, author_id, repeat_parent_id) values
  ('30000000-0000-0000-0000-000000000002', '2026-11-27', '이 날만 고친 운동', '00000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-000000000001');

-- 할 일(#376)
insert into public.todos (id, content, author_id, created_at) values
  ('40000000-0000-0000-0000-000000000001', '벚꽃 보기', '00000000-0000-0000-0000-00000000000a', now()),
  ('40000000-0000-0000-0000-000000000002', '오래된 할 일', '00000000-0000-0000-0000-00000000000a', now() - interval '11 minutes'),
  ('40000000-0000-0000-0000-000000000003', 'B의 할 일', '00000000-0000-0000-0000-00000000000b', now());

-- 비로그인(anon)
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select throws_ok(
  $$select public.claim_partner_push('00000000-0000-0000-0000-00000000000a', 'record', '10000000-0000-0000-0000-000000000001')$$,
  '42501', null, '비로그인이면 알림을 부탁할 수 없다'
);
select throws_ok($$select public.clear_push_badge()$$, '42501', null, '비로그인이면 숫자를 지울 수 없다');

-- 회원 a도 브라우저에서 직접 부를 수 없다(#412). 상대 기기의 구독 주소·키를 돌려주고 상대 구독을 지우므로 서버 경로만 부른다
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);

select throws_ok(
  $$select public.claim_partner_push('00000000-0000-0000-0000-00000000000a', 'record', '10000000-0000-0000-0000-000000000001')$$,
  '42501', null, '회원도 알림 확인 함수를 직접 부를 수 없다'
);
select throws_ok(
  $$select public.delete_push_subscriptions(array['https://web.push.apple.com/b-phone'])$$,
  '42501', null, '회원도 구독 지우기 함수를 직접 부를 수 없다'
);

-- 서버 경로(비밀 키)가 a의 부탁을 확인한다
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

select throws_ok(
  $$select public.claim_partner_push('00000000-0000-0000-0000-0000000000ff', 'record', '10000000-0000-0000-0000-000000000001')$$,
  '42501', null, '허용목록 밖의 사용자 부탁은 거절한다'
);
select throws_ok(
  $$select public.claim_partner_push('00000000-0000-0000-0000-00000000000a', 'photo', '10000000-0000-0000-0000-000000000001')$$,
  '22023', null, '알 수 없는 종류는 거절한다'
);
select is(
  public.claim_partner_push('00000000-0000-0000-0000-00000000000a', 'record', '10000000-0000-0000-0000-0000000000ee') ->> 'status',
  'not-found', '없는 글이면 보내지 않는다'
);
select is(
  public.claim_partner_push('00000000-0000-0000-0000-00000000000a', 'record', '10000000-0000-0000-0000-000000000003') ->> 'status',
  'not-author', '남이 쓴 글이면 보내지 않는다'
);
select is(
  public.claim_partner_push('00000000-0000-0000-0000-00000000000a', 'record', '10000000-0000-0000-0000-000000000002') ->> 'status',
  'too-old', '만든 지 10분이 지난 글이면 보내지 않는다'
);
select is(
  public.claim_partner_push('00000000-0000-0000-0000-00000000000a', 'event', '30000000-0000-0000-0000-000000000002') ->> 'status',
  'not-new', '"이 날만 고치기"로 생긴 일정이면 보내지 않는다'
);

select is(
  -- 되돌리기 표(#409)는 매번 다른 값이라 빼고 비교한다
  public.claim_partner_push('00000000-0000-0000-0000-00000000000a', 'record', '10000000-0000-0000-0000-000000000001') - 'release_token',
  jsonb_build_object('status', 'ready', 'recipients', jsonb_build_array(jsonb_build_object(
    'badge', 1,
    'subscriptions', jsonb_build_array(
      jsonb_build_object('endpoint', 'https://web.push.apple.com/b-phone', 'p256dh', 'key-1', 'auth', 'auth-1'),
      jsonb_build_object('endpoint', 'https://web.push.apple.com/b-tablet', 'p256dh', 'key-2', 'auth', 'auth-2')
    )
  ))),
  '확인을 통과하면 알림을 켠 상대의 모든 기기 구독과 올린 숫자를 돌려준다(기기가 없는 회원과 나는 빠진다)'
);
select is(
  public.claim_partner_push('00000000-0000-0000-0000-00000000000a', 'record', '10000000-0000-0000-0000-000000000001') ->> 'status',
  'already-sent', '같은 글로 다시 부탁하면 보내지 않는다'
);
select is(
  public.claim_partner_push('00000000-0000-0000-0000-00000000000a', 'comment', '20000000-0000-0000-0000-000000000001') #>> '{recipients,0,badge}',
  '2', '보낼 때마다 상대 숫자가 1씩 오른다'
);

-- 할 일도 같은 순서로 확인한다(#376)
select is(
  public.claim_partner_push('00000000-0000-0000-0000-00000000000a', 'todo', '40000000-0000-0000-0000-0000000000ee') ->> 'status',
  'not-found', '없는 할 일이면 보내지 않는다'
);
select is(
  public.claim_partner_push('00000000-0000-0000-0000-00000000000a', 'todo', '40000000-0000-0000-0000-000000000003') ->> 'status',
  'not-author', '남이 추가한 할 일이면 보내지 않는다'
);
select is(
  public.claim_partner_push('00000000-0000-0000-0000-00000000000a', 'todo', '40000000-0000-0000-0000-000000000002') ->> 'status',
  'too-old', '추가한 지 10분이 지난 할 일이면 보내지 않는다'
);
select is(
  public.claim_partner_push('00000000-0000-0000-0000-00000000000a', 'todo', '40000000-0000-0000-0000-000000000001') #>> '{recipients,0,badge}',
  '3', '방금 추가한 할 일이면 알림을 켠 상대에게 보내고 숫자를 올린다'
);
select is(
  public.claim_partner_push('00000000-0000-0000-0000-00000000000a', 'todo', '40000000-0000-0000-0000-000000000001') ->> 'status',
  'already-sent', '같은 할 일로 다시 부탁하면 보내지 않는다'
);

-- a가 앱에서 숫자와 보낸 기록을 직접 보거나 고치려 한다
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
select is_empty(
  $$select * from public.push_settings where member_id = '00000000-0000-0000-0000-00000000000b'$$,
  '상대의 알림 설정과 숫자는 읽을 수 없다'
);
select throws_ok(
  $$update public.push_settings set badge_count = 0$$,
  '42501', null, '숫자를 직접 고칠 수 없다'
);
select throws_ok($$select * from public.push_sent$$, '42501', null, '보낸 기록 표를 직접 읽을 수 없다');

-- b가 설정 화면 스위치로 새 일정·할 일 알림을 꺼 둔다
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
select public.set_push_notify('event', false);
select public.set_push_notify('todo', false);
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

select is(
  public.claim_partner_push('00000000-0000-0000-0000-00000000000a', 'event', '30000000-0000-0000-0000-000000000001') - 'release_token',
  jsonb_build_object('status', 'ready', 'recipients', '[]'::jsonb),
  '상대가 그 종류를 꺼 두었으면 받을 사람이 없다'
);

reset role;
insert into public.todos (id, content, author_id) values
  ('40000000-0000-0000-0000-000000000004', '꺼 둔 뒤 추가한 할 일', '00000000-0000-0000-0000-00000000000a');
set local role service_role;
select is(
  public.claim_partner_push('00000000-0000-0000-0000-00000000000a', 'todo', '40000000-0000-0000-0000-000000000004') - 'release_token',
  jsonb_build_object('status', 'ready', 'recipients', '[]'::jsonb),
  '상대가 할 일 알림을 꺼 두었으면 받을 사람이 없다'
);

reset role;
select results_eq(
  $$select member_id, badge_count from public.push_settings where member_id in (
    '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000c'
  )$$,
  $$values ('00000000-0000-0000-0000-00000000000b'::uuid, 3)$$,
  '꺼 둔 종류는 숫자를 올리지 않고, 알림을 켠 기기가 없는 회원은 설정 행도 생기지 않는다'
);
select results_eq(
  $$select kind, target_id from public.push_sent order by kind, target_id$$,
  $$values
    ('comment', '20000000-0000-0000-0000-000000000001'::uuid),
    ('event', '30000000-0000-0000-0000-000000000001'::uuid),
    ('record', '10000000-0000-0000-0000-000000000001'::uuid),
    ('todo', '40000000-0000-0000-0000-000000000001'::uuid),
    ('todo', '40000000-0000-0000-0000-000000000004'::uuid)$$,
  '받을 사람이 없어도 보낸 것으로 적어 다시 부탁해도 보내지 않는다'
);

-- 하루 지난 보낸 기록은 다음 부탁 때 지운다
update public.push_sent set sent_at = now() - interval '2 days' where kind = 'record';
insert into public.dates (id, date, title, author_id) values
  ('10000000-0000-0000-0000-000000000004', '2026-11-13', '또 쓴 기록', '00000000-0000-0000-0000-00000000000a');
set local role service_role;
select public.claim_partner_push('00000000-0000-0000-0000-00000000000a', 'record', '10000000-0000-0000-0000-000000000004');
reset role;
select is(
  (select count(*)::int from public.push_sent where target_id = '10000000-0000-0000-0000-000000000001'),
  0, '하루 지난 보낸 기록은 지운다'
);

-- b가 앱을 연다
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
select lives_ok($$select public.clear_push_badge()$$, '회원은 자기 숫자를 지운다');

reset role;
select is(
  (select badge_count from public.push_settings where member_id = '00000000-0000-0000-0000-00000000000b'),
  0, '앱을 열면 숫자가 0이 된다'
);

-- a의 알림을 보내다 알림 서비스가 "없는 구독"이라고 답한 b의 기기를 서버 경로가 지운다
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select lives_ok(
  $$select public.delete_push_subscriptions(array['https://web.push.apple.com/b-tablet'])$$,
  '서버 경로는 사라진 구독을 지운다'
);

reset role;
select results_eq(
  $$select endpoint from public.push_subscriptions order by endpoint$$,
  $$values ('https://web.push.apple.com/a-phone'), ('https://web.push.apple.com/b-phone')$$,
  '지정한 구독만 지운다'
);

select * from finish();
rollback;

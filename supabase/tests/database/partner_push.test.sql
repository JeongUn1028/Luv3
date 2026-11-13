-- 상대 활동 알림(#364): claim_partner_push가 부탁을 확인하고 받을 사람의 구독과 숫자를 돌려주는지,
-- 숫자 지우기(clear_push_badge)와 사라진 구독 지우기(delete_push_subscriptions)를 확인한다.
begin;
create extension if not exists pgtap with schema extensions;

select plan(23);

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
  ('00000000-0000-0000-0000-00000000000b', 'https://push.example/b-phone', 'key-1', 'auth-1'),
  ('00000000-0000-0000-0000-00000000000b', 'https://push.example/b-tablet', 'key-2', 'auth-2'),
  ('00000000-0000-0000-0000-00000000000a', 'https://push.example/a-phone', 'key-3', 'auth-3');

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

-- 비로그인(anon)
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select throws_ok(
  $$select public.claim_partner_push('record', '10000000-0000-0000-0000-000000000001')$$,
  '42501', null, '비로그인이면 알림을 부탁할 수 없다'
);
select throws_ok($$select public.clear_push_badge()$$, '42501', null, '비로그인이면 숫자를 지울 수 없다');

-- 허용목록 밖의 사용자
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000ff","role":"authenticated"}', true);

select throws_ok(
  $$select public.claim_partner_push('record', '10000000-0000-0000-0000-000000000001')$$,
  '42501', null, '허용목록 밖의 사용자는 알림을 부탁할 수 없다'
);
select throws_ok(
  $$select public.delete_push_subscriptions(array['https://push.example/b-phone'])$$,
  '42501', null, '허용목록 밖의 사용자는 구독을 지울 수 없다'
);

-- a가 부탁한다
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);

select throws_ok(
  $$select public.claim_partner_push('todo', '10000000-0000-0000-0000-000000000001')$$,
  '22023', null, '알 수 없는 종류는 거절한다'
);
select is(
  public.claim_partner_push('record', '10000000-0000-0000-0000-0000000000ee') ->> 'status',
  'not-found', '없는 글이면 보내지 않는다'
);
select is(
  public.claim_partner_push('record', '10000000-0000-0000-0000-000000000003') ->> 'status',
  'not-author', '남이 쓴 글이면 보내지 않는다'
);
select is(
  public.claim_partner_push('record', '10000000-0000-0000-0000-000000000002') ->> 'status',
  'too-old', '만든 지 10분이 지난 글이면 보내지 않는다'
);
select is(
  public.claim_partner_push('event', '30000000-0000-0000-0000-000000000002') ->> 'status',
  'not-new', '"이 날만 고치기"로 생긴 일정이면 보내지 않는다'
);

select is(
  public.claim_partner_push('record', '10000000-0000-0000-0000-000000000001'),
  jsonb_build_object('status', 'ready', 'recipients', jsonb_build_array(jsonb_build_object(
    'badge', 1,
    'subscriptions', jsonb_build_array(
      jsonb_build_object('endpoint', 'https://push.example/b-phone', 'p256dh', 'key-1', 'auth', 'auth-1'),
      jsonb_build_object('endpoint', 'https://push.example/b-tablet', 'p256dh', 'key-2', 'auth', 'auth-2')
    )
  ))),
  '확인을 통과하면 알림을 켠 상대의 모든 기기 구독과 올린 숫자를 돌려준다(기기가 없는 회원과 나는 빠진다)'
);
select is(
  public.claim_partner_push('record', '10000000-0000-0000-0000-000000000001') ->> 'status',
  'already-sent', '같은 글로 다시 부탁하면 보내지 않는다'
);
select is(
  public.claim_partner_push('comment', '20000000-0000-0000-0000-000000000001') #>> '{recipients,0,badge}',
  '2', '보낼 때마다 상대 숫자가 1씩 오른다'
);

select is_empty(
  $$select * from public.push_settings where member_id = '00000000-0000-0000-0000-00000000000b'$$,
  '상대의 알림 설정과 숫자는 읽을 수 없다'
);
select throws_ok(
  $$update public.push_settings set badge_count = 0$$,
  '42501', null, '숫자를 직접 고칠 수 없다'
);
select throws_ok($$select * from public.push_sent$$, '42501', null, '보낸 기록 표를 직접 읽을 수 없다');

-- b가 설정 화면 스위치로 새 일정 알림을 꺼 둔다
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
select public.set_push_notify('event', false);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);

select is(
  public.claim_partner_push('event', '30000000-0000-0000-0000-000000000001'),
  jsonb_build_object('status', 'ready', 'recipients', '[]'::jsonb),
  '상대가 그 종류를 꺼 두었으면 받을 사람이 없다'
);

reset role;
select results_eq(
  $$select member_id, badge_count from public.push_settings where member_id in (
    '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000c'
  )$$,
  $$values ('00000000-0000-0000-0000-00000000000b'::uuid, 2)$$,
  '꺼 둔 종류는 숫자를 올리지 않고, 알림을 켠 기기가 없는 회원은 설정 행도 생기지 않는다'
);
select results_eq(
  $$select kind, target_id from public.push_sent order by kind$$,
  $$values
    ('comment', '20000000-0000-0000-0000-000000000001'::uuid),
    ('event', '30000000-0000-0000-0000-000000000001'::uuid),
    ('record', '10000000-0000-0000-0000-000000000001'::uuid)$$,
  '받을 사람이 없어도 보낸 것으로 적어 다시 부탁해도 보내지 않는다'
);

-- 하루 지난 보낸 기록은 다음 부탁 때 지운다
update public.push_sent set sent_at = now() - interval '2 days' where kind = 'record';
insert into public.dates (id, date, title, author_id) values
  ('10000000-0000-0000-0000-000000000004', '2026-11-13', '또 쓴 기록', '00000000-0000-0000-0000-00000000000a');
set local role authenticated;
select public.claim_partner_push('record', '10000000-0000-0000-0000-000000000004');
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

-- a가 보내다 알림 서비스가 "없는 구독"이라고 답한 b의 기기를 지운다
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
select lives_ok(
  $$select public.delete_push_subscriptions(array['https://push.example/b-tablet'])$$,
  '회원은 사라진 구독을 지운다'
);

reset role;
select results_eq(
  $$select endpoint from public.push_subscriptions order by endpoint$$,
  $$values ('https://push.example/a-phone'), ('https://push.example/b-phone')$$,
  '지정한 구독만 지운다'
);

select * from finish();
rollback;

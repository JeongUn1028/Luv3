-- 설정 화면의 종류별 알림 스위치(#364): 각자 자기 설정만 읽고, set_push_notify로만 바꾸는지 확인한다.
begin;
create extension if not exists pgtap with schema extensions;

select plan(14);

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-00000000000a', 'a@push-settings.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000000b', 'b@push-settings.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000ff', 'outsider@push-settings.test', 'authenticated', 'authenticated');

insert into public.members (id, email, nickname) values
  ('00000000-0000-0000-0000-00000000000a', 'a@push-settings.test', 'A'),
  ('00000000-0000-0000-0000-00000000000b', 'b@push-settings.test', 'B');

-- b는 알림을 받아 숫자가 4까지 올라 있다(claim_partner_push가 만든 행)
insert into public.push_settings (member_id, badge_count) values ('00000000-0000-0000-0000-00000000000b', 4);

-- 비로그인(anon)
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select throws_ok($$select public.set_push_notify('record', false)$$, '42501', null, '비로그인이면 알림 종류를 바꿀 수 없다');
select throws_ok($$select * from public.push_settings$$, '42501', null, '비로그인이면 알림 설정을 읽을 수 없다');

-- 허용목록 밖의 사용자
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000ff","role":"authenticated"}', true);

select throws_ok($$select public.set_push_notify('record', false)$$, '42501', null, '허용목록 밖의 사용자는 알림 종류를 바꿀 수 없다');

-- a
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);

select is_empty($$select * from public.push_settings$$, '설정을 바꾼 적이 없으면 읽을 행이 없다(모두 켠 것)');
select is_empty(
  $$select * from public.push_settings where member_id = '00000000-0000-0000-0000-00000000000b'$$,
  '상대의 알림 설정은 읽을 수 없다'
);
select throws_ok($$select public.set_push_notify('todo', false)$$, '22023', null, '알 수 없는 종류는 거절한다');
select throws_ok($$select public.set_push_notify('record', null)$$, '22004', null, '켬·끔이 비어 있으면 거절한다');

select lives_ok($$select public.set_push_notify('event', false)$$, '회원은 자기 알림 종류를 끈다');
select results_eq(
  $$select notify_record, notify_comment, notify_event, badge_count from public.push_settings$$,
  $$values (true, true, false, 0)$$,
  '처음 끄면 그 종류만 꺼진 행이 생기고 나머지는 켠 채다'
);

select public.set_push_notify('event', true);
select public.set_push_notify('comment', false);
select results_eq(
  $$select notify_record, notify_comment, notify_event from public.push_settings$$,
  $$values (true, false, true)$$,
  '다시 켜고 다른 종류를 끄면 각각 바뀐다'
);

select throws_ok(
  $$update public.push_settings set notify_record = false$$,
  '42501', null, '설정을 직접 고칠 수 없다(숫자도 함께 막는다)'
);
select throws_ok(
  $$insert into public.push_settings (member_id) values ('00000000-0000-0000-0000-00000000000a')$$,
  '42501', null, '설정 행을 직접 만들 수 없다'
);

-- b가 스위치를 바꿔도 받아 둔 숫자는 그대로다
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
select public.set_push_notify('record', false);
select results_eq(
  $$select notify_record, notify_comment, notify_event, badge_count from public.push_settings$$,
  $$values (false, true, true, 4)$$,
  '스위치를 바꿔도 앱 아이콘 숫자는 그대로다'
);

reset role;
select results_eq(
  $$select count(*)::int from public.push_settings where member_id in ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b')$$,
  $$values (2)$$,
  '한 사람에 한 행만 남는다'
);

select * from finish();
rollback;

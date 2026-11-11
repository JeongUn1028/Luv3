-- 사진별 위치·찍은 시각(#249): 저장, 고치기에서 위치 바꾸기·지우기·그대로 두기, 찍은 시각은 바꾸지 않음, 짝·범위 제약, 시간대 없는 시각 거부를 확인한다.
begin;
create extension if not exists pgtap with schema extensions;

select plan(16);

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-00000000000a', 'a@photo-location.test', 'authenticated', 'authenticated');

insert into public.members (id, email, nickname) values
  ('00000000-0000-0000-0000-00000000000a', 'a@photo-location.test', 'A');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);

select lives_ok(
  $$ select public.create_date_record(
    p_id => '80000000-0000-0000-0000-000000000001', p_date => '2026-11-08', p_title => '성수 데이트', p_place => '성수동', p_memo => null,
    p_photos => '[
      {"id":"81000000-0000-0000-0000-000000000001","caption":"","location":{"place":" 어니언 성수 ","lat":37.5447,"lng":127.0582},"taken_at":"2026-11-08T14:02:11+09:00"},
      {"id":"81000000-0000-0000-0000-000000000002","caption":"","location":null},
      {"id":"81000000-0000-0000-0000-000000000003","caption":""}
    ]',
    p_cover_photo_id => '81000000-0000-0000-0000-000000000001'
  ) $$,
  '사진마다 위치와 찍은 시각을 넘겨 기록을 남길 수 있다'
);
select results_eq(
  $$ select place, place_lat, place_lng, taken_at from public.photos where id = '81000000-0000-0000-0000-000000000001' $$,
  $$ values ('어니언 성수'::text, 37.5447::double precision, 127.0582::double precision, '2026-11-08T05:02:11Z'::timestamptz) $$,
  '사진의 위치 이름(앞뒤 공백 없이)·좌표·찍은 시각을 저장한다'
);
select results_eq(
  $$ select count(*)::int from public.photos
     where id in ('81000000-0000-0000-0000-000000000002', '81000000-0000-0000-0000-000000000003')
       and place is null and place_lat is null and place_lng is null and taken_at is null $$,
  $$ values (2) $$,
  '위치가 null이거나 키가 없는 사진은 위치와 찍은 시각이 없다'
);

select lives_ok(
  $$ select public.update_date_record(
    p_id => '80000000-0000-0000-0000-000000000001', p_date => '2026-11-08', p_title => '성수 데이트', p_place => '성수동', p_memo => null,
    p_photos => '[
      {"id":"81000000-0000-0000-0000-000000000001","caption":"","location":{"place":"서울숲","lat":37.5444,"lng":127.0374},"taken_at":"2026-01-01T00:00:00+09:00"},
      {"id":"81000000-0000-0000-0000-000000000002","caption":"","location":{"place":"서울숲","lat":37.5444,"lng":127.0374}},
      {"id":"81000000-0000-0000-0000-000000000003","caption":""},
      {"id":"81000000-0000-0000-0000-000000000004","caption":"","location":{"place":"뚝섬","lat":37.531,"lng":127.066},"taken_at":"2026-11-08T17:45:20+09:00"}
    ]',
    p_cover_photo_id => '81000000-0000-0000-0000-000000000001'
  ) $$,
  '고칠 때 사진 위치를 바꾸고 새 사진을 더할 수 있다'
);
select results_eq(
  $$ select place, place_lat, place_lng, taken_at from public.photos where id = '81000000-0000-0000-0000-000000000001' $$,
  $$ values ('서울숲'::text, 37.5444::double precision, 127.0374::double precision, '2026-11-08T05:02:11Z'::timestamptz) $$,
  '이미 있는 사진은 위치만 바뀌고 찍은 시각은 그대로다'
);
select results_eq(
  $$ select place from public.photos where id = '81000000-0000-0000-0000-000000000002' $$,
  $$ values ('서울숲'::text) $$,
  '위치가 없던 사진에 위치를 넣을 수 있다'
);
select results_eq(
  $$ select place, taken_at from public.photos where id = '81000000-0000-0000-0000-000000000004' $$,
  $$ values ('뚝섬'::text, '2026-11-08T08:45:20Z'::timestamptz) $$,
  '고치기에서 새로 고른 사진은 위치와 찍은 시각을 함께 저장한다'
);

select lives_ok(
  $$ select public.update_date_record(
    p_id => '80000000-0000-0000-0000-000000000001', p_date => '2026-11-08', p_title => '성수 데이트', p_place => '성수동', p_memo => null,
    p_photos => '[
      {"id":"81000000-0000-0000-0000-000000000001","caption":"","location":null},
      {"id":"81000000-0000-0000-0000-000000000002","caption":""},
      {"id":"81000000-0000-0000-0000-000000000003","caption":""},
      {"id":"81000000-0000-0000-0000-000000000004","caption":""}
    ]',
    p_cover_photo_id => '81000000-0000-0000-0000-000000000001'
  ) $$,
  '고칠 때 사진 위치를 지울 수 있다'
);
select results_eq(
  $$ select place, place_lat, place_lng from public.photos where id = '81000000-0000-0000-0000-000000000001' $$,
  $$ values (null::text, null::double precision, null::double precision) $$,
  '위치를 null로 넘기면 지운다'
);
select results_eq(
  $$ select place from public.photos where id = '81000000-0000-0000-0000-000000000002' $$,
  $$ values ('서울숲'::text) $$,
  '위치 키가 없으면(예전 코드) 있던 위치를 그대로 둔다'
);

select throws_ok(
  $$ select public.update_date_record(
    p_id => '80000000-0000-0000-0000-000000000001', p_date => '2026-11-08', p_title => '성수 데이트', p_place => '성수동', p_memo => null,
    p_photos => '[{"id":"81000000-0000-0000-0000-000000000001","caption":"","location":{"place":"서울숲","lat":37.5444}}]',
    p_cover_photo_id => '81000000-0000-0000-0000-000000000001'
  ) $$,
  '23514', null,
  '좌표가 한쪽만 있는 위치는 거부한다'
);
select throws_ok(
  $$ select public.update_date_record(
    p_id => '80000000-0000-0000-0000-000000000001', p_date => '2026-11-08', p_title => '성수 데이트', p_place => '성수동', p_memo => null,
    p_photos => '[{"id":"81000000-0000-0000-0000-000000000001","caption":"","location":{"place":"   ","lat":37.5,"lng":127}}]',
    p_cover_photo_id => '81000000-0000-0000-0000-000000000001'
  ) $$,
  '23514', null,
  '이름 없이 좌표만 있는 위치는 거부한다'
);
select throws_ok(
  $$ select public.create_date_record(
    p_id => '80000000-0000-0000-0000-000000000002', p_date => '2026-11-08', p_title => '범위 밖', p_place => null, p_memo => null,
    p_photos => '[{"id":"82000000-0000-0000-0000-000000000001","caption":"","location":{"place":"바다","lat":91,"lng":127}}]',
    p_cover_photo_id => '82000000-0000-0000-0000-000000000001'
  ) $$,
  '23514', null,
  '범위를 벗어난 좌표는 거부한다'
);
select throws_ok(
  $$ select public.create_date_record(
    p_id => '80000000-0000-0000-0000-000000000003', p_date => '2026-11-08', p_title => '시간대 없음', p_place => null, p_memo => null,
    p_photos => '[{"id":"83000000-0000-0000-0000-000000000001","caption":"","taken_at":"2026-11-08T14:02:11"}]',
    p_cover_photo_id => '83000000-0000-0000-0000-000000000001'
  ) $$,
  '22023', '찍은 시각은 시간대와 함께 넘깁니다',
  '시간대 없는 찍은 시각은 세션 시간대로 어긋나게 읽히지 않게 거부한다'
);
select is(
  (select count(*)::int from public.dates where id = '80000000-0000-0000-0000-000000000002'),
  0,
  '사진 위치가 거부되면 기록도 남지 않는다'
);

-- 회원은 표를 직접 고칠 수 없으므로(#170) 이름 글자 수 제약은 표 소유자로 확인한다
reset role;

select throws_ok(
  $$ update public.photos set place = repeat('가', 101), place_lat = 37.5, place_lng = 127 where id = '81000000-0000-0000-0000-000000000003' $$,
  '23514', null,
  '100자를 넘는 위치 이름은 저장하지 못한다'
);

select * from finish();
rollback;

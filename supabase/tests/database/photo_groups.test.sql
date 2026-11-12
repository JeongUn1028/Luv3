-- 사진 모음(#297): 모음 표의 접근 권한, 저장 함수의 모음 개수·장수·위치 검사, 고치기에서 모음 바꾸기·지우기, 찍은 시각 처리를 확인한다.
begin;
create extension if not exists pgtap with schema extensions;

select plan(37);

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-00000000000a', 'a@photo-group.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000ff', 'outsider@photo-group.test', 'authenticated', 'authenticated');

insert into public.members (id, email, nickname) values
  ('00000000-0000-0000-0000-00000000000a', 'a@photo-group.test', 'A');

-- 구조: 사진별 위치 칸은 모음으로 옮겨 없고, 옛 시그니처(사진 목록·기록 장소 인자)는 남아 있지 않다
select has_table('public', 'photo_groups', '사진 모음 표가 있다');
select hasnt_column('public', 'photos', 'place', '사진에는 위치 이름 칸이 없다(모음으로 옮김)');
select hasnt_column('public', 'photos', 'place_lat', '사진에는 위도 칸이 없다');
select hasnt_column('public', 'photos', 'place_lng', '사진에는 경도 칸이 없다');
select col_not_null('public', 'photos', 'group_id', '사진은 늘 모음에 속한다');
select hasnt_function(
  'public', 'create_date_record',
  array['uuid', 'date', 'text', 'text', 'text', 'jsonb', 'uuid', 'date', 'text[]', 'jsonb', 'uuid', 'date'],
  '사진 목록을 받는 예전 기록 작성 함수는 남아 있지 않다'
);
select hasnt_function(
  'public', 'update_date_record',
  array['uuid', 'date', 'text', 'text', 'text', 'jsonb', 'uuid', 'date', 'text[]', 'jsonb', 'uuid[]', 'uuid'],
  '사진 목록을 받는 예전 기록 수정 함수는 남아 있지 않다'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);

-- 저장: 모음 둘(첫 모음에 사진 둘, 둘째 모음에 사진 하나)
select lives_ok(
  $$ select public.create_date_record(
    p_id => '90000000-0000-0000-0000-000000000001', p_date => '2026-11-08', p_title => '성수 데이트', p_memo => null,
    p_groups => '[
      {"id":"91000000-0000-0000-0000-000000000001","location":{"place":" 성수동 ","lat":37.5447,"lng":127.0582},"photos":[
        {"id":"92000000-0000-0000-0000-000000000001","caption":"카페","taken_at":"2026-11-08T14:02:11+09:00"},
        {"id":"92000000-0000-0000-0000-000000000002","caption":""}
      ]},
      {"id":"91000000-0000-0000-0000-000000000002","location":{"place":"성수1가1동","lat":37.5444,"lng":127.0374},"photos":[
        {"id":"92000000-0000-0000-0000-000000000003","caption":"숲"}
      ]}
    ]',
    p_cover_photo_id => '92000000-0000-0000-0000-000000000003'
  ) $$,
  '회원은 모음 목록으로 기록을 남긴다'
);
select results_eq(
  $$ select id, sort_order, place, place_lat, place_lng from public.photo_groups
     where date_id = '90000000-0000-0000-0000-000000000001' order by sort_order $$,
  $$ values
    ('91000000-0000-0000-0000-000000000001'::uuid, 0, '성수동'::text, 37.5447::double precision, 127.0582::double precision),
    ('91000000-0000-0000-0000-000000000002'::uuid, 1, '성수1가1동'::text, 37.5444::double precision, 127.0374::double precision) $$,
  '모음은 넘긴 순서와 위치(이름 앞뒤 공백 없이)로 저장된다'
);
select results_eq(
  $$ select id, group_id, sort_order, caption, taken_at from public.photos
     where date_id = '90000000-0000-0000-0000-000000000001' order by sort_order $$,
  $$ values
    ('92000000-0000-0000-0000-000000000001'::uuid, '91000000-0000-0000-0000-000000000001'::uuid, 0, '카페'::text, '2026-11-08T05:02:11Z'::timestamptz),
    ('92000000-0000-0000-0000-000000000002'::uuid, '91000000-0000-0000-0000-000000000001'::uuid, 1, null, null),
    ('92000000-0000-0000-0000-000000000003'::uuid, '91000000-0000-0000-0000-000000000002'::uuid, 2, '숲', null) $$,
  '사진은 자기 모음에 속하고, 사진 순서는 모음 순서·모음 안 순서대로 기록 전체에서 매긴다'
);

-- 읽기·직접 쓰기 권한
select results_eq(
  $$ select count(*)::int from public.photo_groups where date_id = '90000000-0000-0000-0000-000000000001' $$,
  $$ values (2) $$,
  '회원은 모음을 읽을 수 있다'
);
select throws_ok(
  $$ insert into public.photo_groups (id, date_id, sort_order, place, place_lat, place_lng)
     values (gen_random_uuid(), '90000000-0000-0000-0000-000000000001', 9, '몰래', 37.5, 127) $$,
  '42501', null, '회원도 모음 표에 직접 넣을 수 없다(저장 함수로만 쓴다)'
);
select throws_ok(
  $$ update public.photo_groups set place = '바꿈' where id = '91000000-0000-0000-0000-000000000001' $$,
  '42501', null, '회원도 모음 위치를 직접 바꿀 수 없다'
);
select throws_ok(
  $$ delete from public.photo_groups where id = '91000000-0000-0000-0000-000000000001' $$,
  '42501', null, '회원도 모음을 직접 지울 수 없다'
);
select throws_ok(
  $$ update public.photos set group_id = '91000000-0000-0000-0000-000000000002' where id = '92000000-0000-0000-0000-000000000001' $$,
  '42501', null, '회원도 사진을 다른 모음으로 직접 옮길 수 없다'
);

-- 개수·위치 검사
select throws_ok(
  $$ select public.create_date_record(
    p_id => gen_random_uuid(), p_date => '2026-11-08', p_title => '모음 없음', p_memo => null,
    p_groups => '[]', p_cover_photo_id => '93000000-0000-0000-0000-000000000001'
  ) $$,
  '22023', '사진 모음은 1개 이상 10개 이하로 올립니다: 0개',
  '모음이 하나도 없으면 저장하지 않는다'
);
select throws_ok(
  $$ select public.create_date_record(
    p_id => gen_random_uuid(), p_date => '2026-11-08', p_title => '모음 11개', p_memo => null,
    p_groups => (select jsonb_agg(jsonb_build_object(
      'id', gen_random_uuid(), 'location', '{"place":"성수동","lat":37.5,"lng":127.0}'::jsonb,
      'photos', jsonb_build_array(jsonb_build_object('id', gen_random_uuid())))) from generate_series(1, 11)),
    p_cover_photo_id => '93000000-0000-0000-0000-000000000001'
  ) $$,
  '22023', '사진 모음은 1개 이상 10개 이하로 올립니다: 11개',
  '모음이 10개를 넘으면 저장하지 않는다'
);
select lives_ok(
  $$ select public.create_date_record(
    p_id => '90000000-0000-0000-0000-000000000009', p_date => '2026-11-08', p_title => '사진 100장', p_memo => null,
    p_groups => (select jsonb_agg(jsonb_build_object(
      'id', ('94000000-0000-0000-0000-0000000000' || lpad(g::text, 2, '0'))::uuid,
      'location', '{"place":"성수동","lat":37.5,"lng":127.0}'::jsonb,
      'photos', (select jsonb_agg(jsonb_build_object('id', ('95000000-0000-0000-0000-0000000' || lpad(g::text, 2, '0') || lpad(p::text, 3, '0'))::uuid))
                 from generate_series(1, 10) as p)
    )) from generate_series(1, 10) as g),
    p_cover_photo_id => '95000000-0000-0000-0000-000000001001'
  ) $$,
  '모음 10개에 사진을 10장씩, 기록 하나에 사진 100장까지 남긴다'
);
select throws_ok(
  $$ select public.create_date_record(
    p_id => gen_random_uuid(), p_date => '2026-11-08', p_title => '빈 모음', p_memo => null,
    p_groups => '[
      {"id":"93000000-0000-0000-0000-000000000001","location":{"place":"성수동","lat":37.5,"lng":127.0},"photos":[{"id":"93100000-0000-0000-0000-000000000001"}]},
      {"id":"93000000-0000-0000-0000-000000000002","location":{"place":"성수동","lat":37.5,"lng":127.0},"photos":[]}
    ]',
    p_cover_photo_id => '93100000-0000-0000-0000-000000000001'
  ) $$,
  '22023', '모음마다 사진은 1장 이상 10장 이하로 올립니다',
  '사진이 없는 모음이 있으면 저장하지 않는다'
);
select throws_ok(
  $$ select public.create_date_record(
    p_id => gen_random_uuid(), p_date => '2026-11-08', p_title => '위치 없음', p_memo => null,
    p_groups => '[{"id":"93000000-0000-0000-0000-000000000003","photos":[{"id":"93100000-0000-0000-0000-000000000003"}]}]',
    p_cover_photo_id => '93100000-0000-0000-0000-000000000003'
  ) $$,
  '22023', '모음마다 위치를 정합니다',
  '위치가 없는 모음은 저장하지 않는다'
);
select throws_ok(
  $$ select public.create_date_record(
    p_id => gen_random_uuid(), p_date => '2026-11-08', p_title => '좌표 한쪽', p_memo => null,
    p_groups => '[{"id":"93000000-0000-0000-0000-000000000004","location":{"place":"성수동","lat":37.5},"photos":[{"id":"93100000-0000-0000-0000-000000000004"}]}]',
    p_cover_photo_id => '93100000-0000-0000-0000-000000000004'
  ) $$,
  '22023', '모음마다 위치를 정합니다',
  '좌표가 한쪽만 있는 위치는 저장하지 않는다'
);
select throws_ok(
  $$ select public.create_date_record(
    p_id => gen_random_uuid(), p_date => '2026-11-08', p_title => '이름 없음', p_memo => null,
    p_groups => '[{"id":"93000000-0000-0000-0000-000000000005","location":{"place":"   ","lat":37.5,"lng":127.0},"photos":[{"id":"93100000-0000-0000-0000-000000000005"}]}]',
    p_cover_photo_id => '93100000-0000-0000-0000-000000000005'
  ) $$,
  '22023', '모음마다 위치를 정합니다',
  '이름 없이 좌표만 있는 위치는 저장하지 않는다'
);
select throws_ok(
  $$ select public.create_date_record(
    p_id => gen_random_uuid(), p_date => '2026-11-08', p_title => '범위 밖', p_memo => null,
    p_groups => '[{"id":"93000000-0000-0000-0000-000000000006","location":{"place":"바다","lat":91,"lng":127.0},"photos":[{"id":"93100000-0000-0000-0000-000000000006"}]}]',
    p_cover_photo_id => '93100000-0000-0000-0000-000000000006'
  ) $$,
  '23514', null,
  '범위를 벗어난 좌표는 저장하지 않는다'
);
select throws_ok(
  $$ select public.create_date_record(
    p_id => gen_random_uuid(), p_date => '2026-11-08', p_title => '긴 이름', p_memo => null,
    p_groups => jsonb_build_array(jsonb_build_object(
      'id', '93000000-0000-0000-0000-000000000007', 'location', jsonb_build_object('place', repeat('가', 101), 'lat', 37.5, 'lng', 127.0),
      'photos', '[{"id":"93100000-0000-0000-0000-000000000007"}]'::jsonb)),
    p_cover_photo_id => '93100000-0000-0000-0000-000000000007'
  ) $$,
  '23514', null,
  '100자를 넘는 위치 이름은 저장하지 않는다'
);
select throws_ok(
  $$ select public.create_date_record(
    p_id => gen_random_uuid(), p_date => '2026-11-08', p_title => '같은 사진 두 번', p_memo => null,
    p_groups => '[
      {"id":"93000000-0000-0000-0000-000000000008","location":{"place":"성수동","lat":37.5,"lng":127.0},"photos":[{"id":"93100000-0000-0000-0000-000000000008"}]},
      {"id":"93000000-0000-0000-0000-000000000009","location":{"place":"성수동","lat":37.5,"lng":127.0},"photos":[{"id":"93100000-0000-0000-0000-000000000008"}]}
    ]',
    p_cover_photo_id => '93100000-0000-0000-0000-000000000008'
  ) $$,
  '22023', '모음과 사진의 id는 빠지거나 겹칠 수 없습니다',
  '같은 사진을 두 모음에 넣으면 "이미 저장된 기록"(23505)으로 오해되지 않게 거부한다'
);
select throws_ok(
  $$ select public.create_date_record(
    p_id => gen_random_uuid(), p_date => '2026-11-08', p_title => '같은 모음 두 번', p_memo => null,
    p_groups => '[
      {"id":"93000000-0000-0000-0000-000000000010","location":{"place":"성수동","lat":37.5,"lng":127.0},"photos":[{"id":"93100000-0000-0000-0000-000000000010"}]},
      {"id":"93000000-0000-0000-0000-000000000010","location":{"place":"성수동","lat":37.5,"lng":127.0},"photos":[{"id":"93100000-0000-0000-0000-000000000011"}]}
    ]',
    p_cover_photo_id => '93100000-0000-0000-0000-000000000010'
  ) $$,
  '22023', '모음과 사진의 id는 빠지거나 겹칠 수 없습니다',
  '같은 모음 id를 두 번 넘기면 거부한다'
);
select throws_ok(
  $$ select public.create_date_record(
    p_id => gen_random_uuid(), p_date => '2026-11-08', p_title => '남의 모음', p_memo => null,
    p_groups => '[{"id":"91000000-0000-0000-0000-000000000001","location":{"place":"성수동","lat":37.5,"lng":127.0},"photos":[{"id":"93100000-0000-0000-0000-000000000012"}]}]',
    p_cover_photo_id => '93100000-0000-0000-0000-000000000012'
  ) $$,
  '22023', '다른 기록의 모음은 넣을 수 없습니다',
  '다른 기록의 모음 id로는 새 기록을 남기지 않는다'
);
select throws_ok(
  $$ select public.create_date_record(
    p_id => '90000000-0000-0000-0000-000000000003', p_date => '2026-11-08', p_title => '시간대 없음', p_memo => null,
    p_groups => '[{"id":"93000000-0000-0000-0000-000000000013","location":{"place":"성수동","lat":37.5,"lng":127.0},"photos":[{"id":"93100000-0000-0000-0000-000000000013","taken_at":"2026-11-08T14:02:11"}]}]',
    p_cover_photo_id => '93100000-0000-0000-0000-000000000013'
  ) $$,
  '22023', '찍은 시각은 시간대와 함께 넘깁니다',
  '시간대 없는 찍은 시각은 세션 시간대로 어긋나게 읽히지 않게 거부한다'
);

-- 고치기: 모음 순서를 바꾸고(둘째가 앞으로), 첫 모음은 위치를 바꾸며 사진 하나를 빼고, 새 모음을 더한다.
-- 이미 있는 사진의 찍은 시각은 넘겨도 바뀌지 않는다
select is(
  public.update_date_record(
    p_id => '90000000-0000-0000-0000-000000000001', p_date => '2026-11-08', p_title => '성수 데이트', p_memo => null,
    p_groups => '[
      {"id":"91000000-0000-0000-0000-000000000002","location":{"place":"성수1가1동","lat":37.5444,"lng":127.0374},"photos":[
        {"id":"92000000-0000-0000-0000-000000000003","caption":"숲"}
      ]},
      {"id":"91000000-0000-0000-0000-000000000001","location":{"place":"성수2가3동","lat":37.54,"lng":127.05},"photos":[
        {"id":"92000000-0000-0000-0000-000000000001","caption":"카페","taken_at":"2026-01-01T00:00:00+09:00"}
      ]},
      {"id":"91000000-0000-0000-0000-000000000003","location":{"place":"뚝섬","lat":37.531,"lng":127.066},"photos":[
        {"id":"92000000-0000-0000-0000-000000000004","caption":"","taken_at":"2026-11-08T17:45:20+09:00"}
      ]}
    ]',
    p_cover_photo_id => '92000000-0000-0000-0000-000000000003'
  ),
  array[
    '90000000-0000-0000-0000-000000000001/92000000-0000-0000-0000-000000000002.jpg',
    '90000000-0000-0000-0000-000000000001/92000000-0000-0000-0000-000000000002_thumb.jpg'
  ],
  '고치기에서 뺀 사진의 파일 경로를 돌려준다'
);
select results_eq(
  $$ select id, sort_order, place from public.photo_groups where date_id = '90000000-0000-0000-0000-000000000001' order by sort_order $$,
  $$ values
    ('91000000-0000-0000-0000-000000000002'::uuid, 0, '성수1가1동'::text),
    ('91000000-0000-0000-0000-000000000001'::uuid, 1, '성수2가3동'::text),
    ('91000000-0000-0000-0000-000000000003'::uuid, 2, '뚝섬'::text) $$,
  '고치기에서 모음 순서와 위치를 바꾸고 새 모음을 더한다'
);
select results_eq(
  $$ select id, group_id, sort_order, taken_at from public.photos where date_id = '90000000-0000-0000-0000-000000000001' order by sort_order $$,
  $$ values
    ('92000000-0000-0000-0000-000000000003'::uuid, '91000000-0000-0000-0000-000000000002'::uuid, 0, null::timestamptz),
    ('92000000-0000-0000-0000-000000000001'::uuid, '91000000-0000-0000-0000-000000000001'::uuid, 1, '2026-11-08T05:02:11Z'::timestamptz),
    ('92000000-0000-0000-0000-000000000004'::uuid, '91000000-0000-0000-0000-000000000003'::uuid, 2, '2026-11-08T08:45:20Z'::timestamptz) $$,
  '사진 순서는 바뀐 모음 순서를 따르고, 이미 있던 사진의 찍은 시각은 그대로, 새 사진은 찍은 시각을 저장한다'
);

-- 넘기지 않은 모음은 그 사진과 함께 지운다
select is(
  public.update_date_record(
    p_id => '90000000-0000-0000-0000-000000000001', p_date => '2026-11-08', p_title => '성수 데이트', p_memo => null,
    p_groups => '[
      {"id":"91000000-0000-0000-0000-000000000002","location":{"place":"성수1가1동","lat":37.5444,"lng":127.0374},"photos":[
        {"id":"92000000-0000-0000-0000-000000000003","caption":"숲"}
      ]}
    ]',
    p_cover_photo_id => '92000000-0000-0000-0000-000000000003'
  ),
  array[
    '90000000-0000-0000-0000-000000000001/92000000-0000-0000-0000-000000000001.jpg',
    '90000000-0000-0000-0000-000000000001/92000000-0000-0000-0000-000000000001_thumb.jpg',
    '90000000-0000-0000-0000-000000000001/92000000-0000-0000-0000-000000000004.jpg',
    '90000000-0000-0000-0000-000000000001/92000000-0000-0000-0000-000000000004_thumb.jpg'
  ],
  '모음을 빼면 그 모음 사진의 파일 경로를 돌려준다'
);
select results_eq(
  $$ select id from public.photo_groups where date_id = '90000000-0000-0000-0000-000000000001' $$,
  $$ values ('91000000-0000-0000-0000-000000000002'::uuid) $$,
  '넘기지 않은 모음은 지운다'
);
select throws_ok(
  $$ select public.update_date_record(
    p_id => '90000000-0000-0000-0000-000000000001', p_date => '2026-11-08', p_title => '성수 데이트', p_memo => null,
    p_groups => '[{"id":"94000000-0000-0000-0000-000000000001","location":{"place":"성수동","lat":37.5,"lng":127.0},"photos":[{"id":"92000000-0000-0000-0000-000000000003"}]}]',
    p_cover_photo_id => '92000000-0000-0000-0000-000000000003'
  ) $$,
  '22023', '다른 기록의 모음은 넣을 수 없습니다',
  '다른 기록의 모음 id로는 고치지 않는다'
);

-- 기록을 지우면 모음도 함께 지워진다(회원은 기록 지우기만 직접 할 수 있다)
delete from public.dates where id = '90000000-0000-0000-0000-000000000009';
select is(
  (select count(*)::int from public.photo_groups where date_id = '90000000-0000-0000-0000-000000000009'),
  0,
  '기록을 지우면 모음도 함께 지워진다'
);

-- 허용목록 밖의 사용자는 모음을 볼 수 없다
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000ff","role":"authenticated"}', true);
select is_empty('select * from public.photo_groups', '허용목록 밖의 사용자는 모음을 볼 수 없다');

-- 비로그인은 표에 권한이 없다
reset role;
set local role anon;
select throws_ok('select * from public.photo_groups', '42501', null, '비로그인은 모음 표를 읽을 권한이 없다');

select * from finish();
rollback;

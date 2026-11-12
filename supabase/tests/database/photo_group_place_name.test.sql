-- 모음 장소 이름(photo_groups.place_name, #317)의 길이 제한, 두 저장 함수의 저장·비우기·예전 앱 대응, 기록 찾기를 확인한다.
begin;
create extension if not exists pgtap with schema extensions;

select plan(11);

-- 준비: 허용된 두 사람(a, b)
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-00000000000a', 'a@place-name.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000000b', 'b@place-name.test', 'authenticated', 'authenticated');

insert into public.members (id, email, nickname) values
  ('00000000-0000-0000-0000-00000000000a', 'a@place-name.test', 'A'),
  ('00000000-0000-0000-0000-00000000000b', 'b@place-name.test', 'B');

select has_column('public', 'photo_groups', 'place_name', 'photo_groups에 모음 장소 이름 컬럼이 있다');

-- 값 제약. 회원은 표를 직접 쓸 수 없으므로(#170) 표 소유자로 넣어 확인한다. 바이트가 아닌 글자 수로 세는지 보려고 한글로 채운다
insert into public.dates (id, date, title, author_id)
values ('10000000-0000-0000-0000-000000000001', '2026-11-01', '첫 데이트', '00000000-0000-0000-0000-00000000000a');

select lives_ok(
  $$insert into public.photo_groups (id, date_id, sort_order, place, place_lat, place_lng, place_name)
    values ('10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 0, '테스트 장소', 37.5, 127.0, repeat('가', 30))$$,
  '모음 장소 이름은 30자까지 저장된다'
);

select throws_ok(
  $$insert into public.photo_groups (id, date_id, sort_order, place, place_lat, place_lng, place_name)
    values ('10000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 1, '테스트 장소', 37.5, 127.0, repeat('가', 31))$$,
  '23514',
  null,
  '모음 장소 이름이 30자를 넘으면 저장되지 않는다'
);

insert into public.photos (id, date_id, group_id, path, thumb_path) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
   '10000000-0000-0000-0000-000000000001/20000000-0000-0000-0000-000000000001.jpg',
   '10000000-0000-0000-0000-000000000001/20000000-0000-0000-0000-000000000001_thumb.jpg');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);

-- 작성 함수: 모음 JSON의 place_name을 앞뒤 공백 없이 저장한다
select public.create_date_record(
  '10000000-0000-0000-0000-000000000009', '2026-11-02', '두 번째 데이트', null,
  '[{"id":"10000000-0000-0000-0000-000000000019","location":{"place":"성동구 성수1가1동","lat":37.5,"lng":127.0},"place_name":" 골목 끝 카페 ","photos":[{"id":"20000000-0000-0000-0000-000000000009"}]}]',
  '20000000-0000-0000-0000-000000000009'
);

select is(
  (select place_name from public.photo_groups where id = '10000000-0000-0000-0000-000000000019'),
  '골목 끝 카페',
  '작성 함수가 모음 장소 이름을 앞뒤 공백 없이 저장한다'
);

-- 고치기 함수: 상대가 붙인 이름도 고치고, 비우면 null로 둔다
select public.update_date_record(
  '10000000-0000-0000-0000-000000000001', '2026-11-01', '첫 데이트', null,
  '[{"id":"10000000-0000-0000-0000-000000000001","location":{"place":"테스트 장소","lat":37.5,"lng":127.0},"place_name":"서울숲 산책","photos":[{"id":"20000000-0000-0000-0000-000000000001"}]}]', '20000000-0000-0000-0000-000000000001'
);

select is(
  (select place_name from public.photo_groups where id = '10000000-0000-0000-0000-000000000001'),
  '서울숲 산책',
  '허용된 다른 사용자가 붙인 모음 장소 이름도 고칠 수 있다'
);

-- 기록 찾기: 낱말을 모음 장소 이름에서도 찾는다
select is(
  (select array_agg(id order by id) from public.search_date_records(p_words => '{서울숲}')),
  array['10000000-0000-0000-0000-000000000001'::uuid],
  '모음 장소 이름의 낱말로 기록을 찾는다'
);

select public.update_date_record(
  '10000000-0000-0000-0000-000000000001', '2026-11-01', '첫 데이트', null,
  '[{"id":"10000000-0000-0000-0000-000000000001","location":{"place":"테스트 장소","lat":37.5,"lng":127.0},"place_name":"  ","photos":[{"id":"20000000-0000-0000-0000-000000000001"}]}]', '20000000-0000-0000-0000-000000000001'
);

select is(
  (select place_name from public.photo_groups where id = '10000000-0000-0000-0000-000000000001'),
  null,
  '빈 장소 이름으로 고치면 모음 장소 이름을 비운다'
);

-- 예전 앱(배포 직전 화면)은 모음에 place_name을 넘기지 않는다. 그때 상대가 붙인 이름을 지우지 않는다
select public.update_date_record(
  '10000000-0000-0000-0000-000000000001', '2026-11-01', '첫 데이트', null,
  '[{"id":"10000000-0000-0000-0000-000000000001","location":{"place":"테스트 장소","lat":37.5,"lng":127.0},"place_name":"남길 이름","photos":[{"id":"20000000-0000-0000-0000-000000000001"}]}]', '20000000-0000-0000-0000-000000000001'
);
select public.update_date_record(
  '10000000-0000-0000-0000-000000000001', '2026-11-01', '첫 데이트', null,
  '[{"id":"10000000-0000-0000-0000-000000000001","location":{"place":"테스트 장소","lat":37.5,"lng":127.0},"caption":"한마디만","photos":[{"id":"20000000-0000-0000-0000-000000000001"}]}]', '20000000-0000-0000-0000-000000000001'
);

select is(
  (select place_name from public.photo_groups where id = '10000000-0000-0000-0000-000000000001'),
  '남길 이름',
  '모음에 place_name을 넘기지 않으면(예전 앱) 저장된 장소 이름을 그대로 둔다'
);

select is(
  (select caption from public.photo_groups where id = '10000000-0000-0000-0000-000000000001'),
  '한마디만',
  '장소 이름을 넘기지 않아도 한마디는 넘긴 대로 고친다'
);

select throws_ok(
  $$select public.update_date_record(
    '10000000-0000-0000-0000-000000000001', '2026-11-01', '첫 데이트', null,
    '[{"id":"10000000-0000-0000-0000-000000000001","location":{"place":"테스트 장소","lat":37.5,"lng":127.0},"place_name":123,"photos":[{"id":"20000000-0000-0000-0000-000000000001"}]}]', '20000000-0000-0000-0000-000000000001')$$,
  '22023',
  null,
  '모음 장소 이름이 글자가 아니면 저장하지 않는다'
);

select throws_ok(
  $$select public.update_date_record(
    '10000000-0000-0000-0000-000000000001', '2026-11-01', '첫 데이트', null,
    '[{"id":"10000000-0000-0000-0000-000000000001","location":{"place":"테스트 장소","lat":37.5,"lng":127.0},"place_name":"가나다라마바사아자차카타파하가나다라마바사아자차카타파하가나다","photos":[{"id":"20000000-0000-0000-0000-000000000001"}]}]', '20000000-0000-0000-0000-000000000001')$$,
  '23514',
  null,
  '저장 함수도 30자를 넘는 장소 이름은 거부한다'
);

select * from finish();
rollback;

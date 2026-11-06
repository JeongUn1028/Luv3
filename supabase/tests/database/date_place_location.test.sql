-- 기록 장소 좌표(#17): 저장·수정, 넘기지 않으면 유지, 빈 객체로 지우기, 짝·범위 제약을 확인한다.
begin;
create extension if not exists pgtap with schema extensions;

select plan(12);

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-00000000000a', 'a@location.test', 'authenticated', 'authenticated');

insert into public.members (id, email, nickname) values
  ('00000000-0000-0000-0000-00000000000a', 'a@location.test', 'A');

-- 예전 시그니처가 남으면 인자 수에 따라 다른 함수를 부르게 되므로 하나만 있어야 한다
select hasnt_function(
  'public', 'create_date_record',
  array['uuid', 'date', 'text', 'text', 'text', 'jsonb', 'uuid', 'date', 'text[]'],
  '좌표 없는 예전 기록 작성 함수는 남아 있지 않다'
);
select hasnt_function(
  'public', 'update_date_record',
  array['uuid', 'date', 'text', 'text', 'text', 'jsonb', 'uuid', 'date', 'text[]'],
  '좌표 없는 예전 기록 수정 함수는 남아 있지 않다'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);

select public.create_date_record(
  p_id => '70000000-0000-0000-0000-000000000001', p_date => '2026-11-01', p_title => '좌표 있음', p_place => '성수동', p_memo => null,
  p_photos => '[{"id":"71000000-0000-0000-0000-000000000001"}]', p_cover_photo_id => '71000000-0000-0000-0000-000000000001',
  p_place_location => '{"lat":37.5445,"lng":127.0561}'
);
select results_eq(
  $$ select place_lat, place_lng from public.dates where id = '70000000-0000-0000-0000-000000000001' $$,
  $$ values (37.5445::double precision, 127.0561::double precision) $$,
  '작성할 때 좌표를 저장한다'
);

select public.create_date_record(
  p_id => '70000000-0000-0000-0000-000000000002', p_date => '2026-11-02', p_title => '좌표 없음', p_place => null, p_memo => null,
  p_photos => '[{"id":"71000000-0000-0000-0000-000000000002"}]', p_cover_photo_id => '71000000-0000-0000-0000-000000000002'
);
select is(
  (select place_lat from public.dates where id = '70000000-0000-0000-0000-000000000002'),
  null::double precision,
  '좌표를 넘기지 않고 작성하면 좌표가 없다'
);

select lives_ok(
  $$ select public.update_date_record(
    p_id => '70000000-0000-0000-0000-000000000001', p_date => '2026-11-01', p_title => '좌표 유지', p_place => '성수동', p_memo => null,
    p_photos => '[{"id":"71000000-0000-0000-0000-000000000001"}]', p_cover_photo_id => '71000000-0000-0000-0000-000000000001'
  ) $$,
  '좌표를 넘기지 않고 고칠 수 있다'
);
select is(
  (select place_lat from public.dates where id = '70000000-0000-0000-0000-000000000001'),
  37.5445::double precision,
  '좌표를 넘기지 않고 고치면(예전 코드) 있던 좌표를 그대로 둔다'
);

select lives_ok(
  $$ select public.update_date_record(
    p_id => '70000000-0000-0000-0000-000000000001', p_date => '2026-11-01', p_title => '좌표 바꿈', p_place => '한강', p_memo => null,
    p_photos => '[{"id":"71000000-0000-0000-0000-000000000001"}]', p_cover_photo_id => '71000000-0000-0000-0000-000000000001',
    p_place_location => '{"lat":37.52,"lng":126.93}'
  ) $$,
  '좌표를 바꿀 수 있다'
);
select results_eq(
  $$ select place_lat, place_lng from public.dates where id = '70000000-0000-0000-0000-000000000001' $$,
  $$ values (37.52::double precision, 126.93::double precision) $$,
  '고칠 때 넘긴 좌표로 바꾼다'
);

select lives_ok(
  $$ select public.update_date_record(
    p_id => '70000000-0000-0000-0000-000000000001', p_date => '2026-11-01', p_title => '좌표 지움', p_place => '한강', p_memo => null,
    p_photos => '[{"id":"71000000-0000-0000-0000-000000000001"}]', p_cover_photo_id => '71000000-0000-0000-0000-000000000001',
    p_place_location => '{}'
  ) $$,
  '빈 객체로 좌표를 지울 수 있다'
);
select results_eq(
  $$ select place_lat, place_lng from public.dates where id = '70000000-0000-0000-0000-000000000001' $$,
  $$ values (null::double precision, null::double precision) $$,
  '빈 객체를 넘기면 좌표를 지운다'
);

select throws_ok(
  $$ update public.dates set place_lat = 37.5 where id = '70000000-0000-0000-0000-000000000002' $$,
  '23514', null,
  '위도만 있는 좌표는 저장하지 못한다'
);
select throws_ok(
  $$ update public.dates set place_lat = 91, place_lng = 127 where id = '70000000-0000-0000-0000-000000000002' $$,
  '23514', null,
  '범위를 벗어난 좌표는 저장하지 못한다'
);

select * from finish();
rollback;

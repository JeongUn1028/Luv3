-- 기록 장소 지우기(#296): 칸이 없고, 저장 함수는 남겨 둔 장소 인자를 받아도 무시하는지 확인한다.
begin;
create extension if not exists pgtap with schema extensions;

select plan(10);

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-00000000000a', 'a@noplace.test', 'authenticated', 'authenticated');

insert into public.members (id, email, nickname) values
  ('00000000-0000-0000-0000-00000000000a', 'a@noplace.test', 'A');

select hasnt_column('public', 'dates', 'place', '기록 장소 이름 칸이 없다');
select hasnt_column('public', 'dates', 'place_lat', '기록 장소 위도 칸이 없다');
select hasnt_column('public', 'dates', 'place_lng', '기록 장소 경도 칸이 없다');

-- 예전 시그니처가 남으면 인자 수에 따라 다른 함수를 부르게 되므로 하나만 있어야 한다(date_place_location 테스트에서 옮김)
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

select lives_ok(
  $$ select public.create_date_record(
    p_id => '73000000-0000-0000-0000-000000000001', p_date => '2026-11-01', p_title => '장소 인자', p_place => '성수동', p_memo => null,
    p_photos => '[{"id":"74000000-0000-0000-0000-000000000001"}]', p_cover_photo_id => '74000000-0000-0000-0000-000000000001',
    p_place_location => '{"lat":37.5445,"lng":127.0561}'
  ) $$,
  '작성 함수는 장소 인자를 받아도 무시하고 기록을 만든다'
);
select is(
  (select title from public.dates where id = '73000000-0000-0000-0000-000000000001'),
  '장소 인자',
  '장소 인자와 함께 넘긴 제목은 저장된다'
);

select lives_ok(
  $$ select public.update_date_record(
    p_id => '73000000-0000-0000-0000-000000000001', p_date => '2026-11-01', p_title => '장소 인자(고침)', p_place => '망원동', p_memo => null,
    p_photos => '[{"id":"74000000-0000-0000-0000-000000000001"}]', p_cover_photo_id => '74000000-0000-0000-0000-000000000001',
    p_place_location => '{"lat":37.55,"lng":126.9}'
  ) $$,
  '수정 함수는 장소 인자를 받아도 무시하고 기록을 고친다'
);
select is(
  (select title from public.dates where id = '73000000-0000-0000-0000-000000000001'),
  '장소 인자(고침)',
  '장소 인자와 함께 넘긴 제목은 고쳐진다'
);

select is(
  (select count(*) from public.search_date_records(array['망원동']) where id = '73000000-0000-0000-0000-000000000001'),
  0::bigint,
  '넘긴 장소 글자로는 찾아지지 않는다'
);

select * from finish();
rollback;

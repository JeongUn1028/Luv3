-- 오래된 화면으로 저장하면 거부한다(#158). 판 번호로 고친 뒤의 저장을 알아본다.
begin;
create extension if not exists pgtap with schema extensions;

select plan(15);

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-00000000000a', 'a@revision.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000000b', 'b@revision.test', 'authenticated', 'authenticated');

insert into public.members (id, email, nickname) values
  ('00000000-0000-0000-0000-00000000000a', 'a@revision.test', 'A'),
  ('00000000-0000-0000-0000-00000000000b', 'b@revision.test', 'B');

insert into public.dates (id, date, title, author_id, revision) values
  ('10000000-0000-0000-0000-000000000001', '2026-11-01', '처음', '00000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-000000000001');

insert into public.photo_groups (id, date_id, sort_order, place, place_lat, place_lng)
values ('10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 0, '테스트 장소', 37.5, 127.0);

insert into public.photos (id, date_id, group_id, path, thumb_path, sort_order) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
   '10000000-0000-0000-0000-000000000001/20000000-0000-0000-0000-000000000001.jpg',
   '10000000-0000-0000-0000-000000000001/20000000-0000-0000-0000-000000000001_thumb.jpg', 0);

update public.dates set cover_photo_id = '20000000-0000-0000-0000-000000000001' where id = '10000000-0000-0000-0000-000000000001';

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);

-- 상대(B)가 먼저 사진을 더해 저장한다
select lives_ok(
  $$select public.update_date_record(
      p_id => '10000000-0000-0000-0000-000000000001', p_date => '2026-11-01', p_title => '상대가 고침', p_memo => null,
      p_groups => '[{"id":"10000000-0000-0000-0000-000000000001","location":{"place":"테스트 장소","lat":37.5,"lng":127.0},"photos":[{"id":"20000000-0000-0000-0000-000000000001"},{"id":"20000000-0000-0000-0000-000000000002"}]}]',
      p_cover_photo_id => '20000000-0000-0000-0000-000000000001',
      p_expected_revisions => array['30000000-0000-0000-0000-000000000001']::uuid[], p_new_revision => '30000000-0000-0000-0000-00000000000b')$$,
  '화면을 연 뒤 바뀌지 않았으면 고칠 수 있다'
);

select is(
  (select revision from public.dates where id = '10000000-0000-0000-0000-000000000001'),
  '30000000-0000-0000-0000-00000000000b'::uuid,
  '저장하면 판 번호가 앱이 정한 값으로 바뀐다'
);

-- 나(A)는 그 전에 연 화면으로 저장한다
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);

select throws_ok(
  $$select public.update_date_record(
      p_id => '10000000-0000-0000-0000-000000000001', p_date => '2026-11-01', p_title => '오래된 화면', p_memo => null,
      p_groups => '[{"id":"10000000-0000-0000-0000-000000000001","location":{"place":"테스트 장소","lat":37.5,"lng":127.0},"photos":[{"id":"20000000-0000-0000-0000-000000000001"}]}]',
      p_cover_photo_id => '20000000-0000-0000-0000-000000000001',
      p_expected_revisions => array['30000000-0000-0000-0000-000000000001']::uuid[], p_new_revision => '30000000-0000-0000-0000-00000000000a')$$,
  'P0409',
  null,
  '화면을 연 뒤 바뀌었으면 저장을 거부한다'
);

select is(
  (select title from public.dates where id = '10000000-0000-0000-0000-000000000001'),
  '상대가 고침',
  '거부되면 글이 되돌아가지 않는다'
);

select is(
  (select count(*)::int from public.photos where date_id = '10000000-0000-0000-0000-000000000001'),
  2,
  '거부되면 상대가 더한 사진이 지워지지 않는다'
);

select is(
  (select revision from public.dates where id = '10000000-0000-0000-0000-000000000001'),
  '30000000-0000-0000-0000-00000000000b'::uuid,
  '거부되면 판 번호가 그대로다'
);

-- 응답만 끊겨 다시 보내면, 첫 요청이 저장했어도 내 앞선 저장이라 통과한다
select lives_ok(
  $$select public.update_date_record(
      p_id => '10000000-0000-0000-0000-000000000001', p_date => '2026-11-01', p_title => '다시 보냄', p_memo => null,
      p_groups => '[{"id":"10000000-0000-0000-0000-000000000001","location":{"place":"테스트 장소","lat":37.5,"lng":127.0},"photos":[{"id":"20000000-0000-0000-0000-000000000001"},{"id":"20000000-0000-0000-0000-000000000002"}]}]',
      p_cover_photo_id => '20000000-0000-0000-0000-000000000001',
      p_expected_revisions => array['30000000-0000-0000-0000-000000000001']::uuid[], p_new_revision => '30000000-0000-0000-0000-00000000000b')$$,
  '내 앞선 저장이면 다시 보내도 된다'
);

select is(
  (select title from public.dates where id = '10000000-0000-0000-0000-000000000001'),
  '다시 보냄',
  '다시 보낸 내용으로 고쳐진다'
);

-- 내용을 고쳐 다시 저장할 때는 새 판 번호를 쓰고, 앞선 시도의 판 번호를 함께 보낸다
select lives_ok(
  $$select public.update_date_record(
      p_id => '10000000-0000-0000-0000-000000000001', p_date => '2026-11-01', p_title => '고쳐서 다시', p_memo => null,
      p_groups => '[{"id":"10000000-0000-0000-0000-000000000001","location":{"place":"테스트 장소","lat":37.5,"lng":127.0},"photos":[{"id":"20000000-0000-0000-0000-000000000001"},{"id":"20000000-0000-0000-0000-000000000002"}]}]',
      p_cover_photo_id => '20000000-0000-0000-0000-000000000001',
      p_expected_revisions => array['30000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-00000000000b']::uuid[],
      p_new_revision => '30000000-0000-0000-0000-00000000000c')$$,
  '내 앞선 시도의 판 번호면 고쳐서 다시 저장할 수 있다'
);

select is(
  (select revision from public.dates where id = '10000000-0000-0000-0000-000000000001'),
  '30000000-0000-0000-0000-00000000000c'::uuid,
  '고쳐서 다시 저장하면 판 번호가 바뀐다'
);

select throws_ok(
  $$select public.update_date_record(
      p_id => '10000000-0000-0000-0000-000000000001', p_date => '2026-11-01', p_title => '앞선 판을 본 상대', p_memo => null,
      p_groups => '[{"id":"10000000-0000-0000-0000-000000000001","location":{"place":"테스트 장소","lat":37.5,"lng":127.0},"photos":[{"id":"20000000-0000-0000-0000-000000000001"}]}]',
      p_cover_photo_id => '20000000-0000-0000-0000-000000000001',
      p_expected_revisions => array['30000000-0000-0000-0000-00000000000b']::uuid[], p_new_revision => '30000000-0000-0000-0000-00000000000d')$$,
  'P0409',
  null,
  '앞선 판을 보고 있던 상대의 저장은 거부한다'
);

-- 예전 앱은 판 번호를 보내지 않는다
select lives_ok(
  $$select public.update_date_record(
      p_id => '10000000-0000-0000-0000-000000000001', p_date => '2026-11-01', p_title => '예전 앱', p_memo => null,
      p_groups => '[{"id":"10000000-0000-0000-0000-000000000001","location":{"place":"테스트 장소","lat":37.5,"lng":127.0},"photos":[{"id":"20000000-0000-0000-0000-000000000001"},{"id":"20000000-0000-0000-0000-000000000002"}]}]',
      p_cover_photo_id => '20000000-0000-0000-0000-000000000001')$$,
  '판 번호를 보내지 않으면 지금처럼 고친다'
);

select isnt(
  (select revision from public.dates where id = '10000000-0000-0000-0000-000000000001'),
  '30000000-0000-0000-0000-00000000000c'::uuid,
  '판 번호를 보내지 않아도 판 번호는 바뀌어, 열어 둔 화면이 알아챈다'
);

select throws_ok(
  $$select public.update_date_record(
      p_id => '10000000-0000-0000-0000-0000000000ee', p_date => '2026-11-01', p_title => '없음', p_memo => null,
      p_groups => '[{"id":"10000000-0000-0000-0000-0000000000ee","location":{"place":"테스트 장소","lat":37.5,"lng":127.0},"photos":[{"id":"20000000-0000-0000-0000-0000000000ee"}]}]',
      p_cover_photo_id => '20000000-0000-0000-0000-0000000000ee',
      p_expected_revisions => array['30000000-0000-0000-0000-000000000001']::uuid[], p_new_revision => '30000000-0000-0000-0000-00000000000a')$$,
  'P0002',
  null,
  '지워진 기록은 판 번호와 상관없이 없다고 알린다'
);

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select throws_ok(
  $$select public.update_date_record(
      p_id => '10000000-0000-0000-0000-000000000001', p_date => '2026-11-01', p_title => '비로그인', p_memo => null,
      p_groups => '[{"id":"10000000-0000-0000-0000-000000000001","location":{"place":"테스트 장소","lat":37.5,"lng":127.0},"photos":[{"id":"20000000-0000-0000-0000-000000000001"}]}]',
      p_cover_photo_id => '20000000-0000-0000-0000-000000000001')$$,
  '42501',
  null,
  '비로그인이면 실행할 권한이 없다'
);

select * from finish();
rollback;

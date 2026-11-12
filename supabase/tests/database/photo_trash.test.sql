-- 지운 사진 휴지통(#311): 기록을 지우거나 고치기에서 사진을 빼면 파일 경로와 기록 날짜·제목이 휴지통에 남는지,
-- 회원은 휴지통을 직접 고칠 수 없는지 확인한다. 파일은 앱이 지우지 않고 매달 정리 작업이 보관 기간이 지난 것만 지운다.
-- 휴지통 표는 개발 DB에 E2E 등이 남긴 행이 있을 수 있어, 이 테스트가 만든 사진·기록만 본다
begin;
create extension if not exists pgtap with schema extensions;

select plan(14);

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-00000000000a', 'a@trash.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000000b', 'b@trash.test', 'authenticated', 'authenticated');

insert into public.members (id, email, nickname) values
  ('00000000-0000-0000-0000-00000000000a', 'a@trash.test', 'A'),
  ('00000000-0000-0000-0000-00000000000b', 'b@trash.test', 'B');

select has_table('public', 'photo_trash', '휴지통 표가 있다');

-- a가 사진 세 장짜리 기록을 만든다
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);

select public.create_date_record(
  '10000000-0000-0000-0000-000000000001', '2026-11-01', '성수 산책', null,
  '[{"id":"10000000-0000-0000-0000-000000000001","location":{"place":"테스트 장소","lat":37.5,"lng":127.0},"photos":[{"id":"20000000-0000-0000-0000-000000000001","taken_at":"2026-11-01T06:12:00Z"},{"id":"20000000-0000-0000-0000-000000000002"},{"id":"20000000-0000-0000-0000-000000000003"}]}]',
  '20000000-0000-0000-0000-000000000001');

-- b가 고치기에서 사진 하나를 뺀다
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
select public.update_date_record(
  '10000000-0000-0000-0000-000000000001', '2026-11-01', '성수 산책', null,
  '[{"id":"10000000-0000-0000-0000-000000000001","location":{"place":"테스트 장소","lat":37.5,"lng":127.0},"photos":[{"id":"20000000-0000-0000-0000-000000000001"},{"id":"20000000-0000-0000-0000-000000000003"}]}]',
  '20000000-0000-0000-0000-000000000001');

reset role;

select results_eq(
  $$select photo_id, date_id, path, thumb_path, record_date, record_title, deleted_with_record, deleted_by
    from public.photo_trash where date_id = '10000000-0000-0000-0000-000000000001'$$,
  $$values ('20000000-0000-0000-0000-000000000002'::uuid, '10000000-0000-0000-0000-000000000001'::uuid,
            '10000000-0000-0000-0000-000000000001/20000000-0000-0000-0000-000000000002.jpg',
            '10000000-0000-0000-0000-000000000001/20000000-0000-0000-0000-000000000002_thumb.jpg',
            '2026-11-01'::date, '성수 산책', false, '00000000-0000-0000-0000-00000000000b'::uuid)$$,
  '고치기에서 뺀 사진은 경로·기록 날짜·제목·지운 사람과 함께 휴지통에 남는다'
);

select ok(
  (select deleted_at > now() - interval '1 minute' and deleted_at <= now() from public.photo_trash
    where photo_id = '20000000-0000-0000-0000-000000000002'),
  '지운 시각을 남긴다'
);

-- 회원은 휴지통을 직접 읽거나 고칠 수 없다(되살리기 화면은 다음 PR에서 읽기만 연다)
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);

select throws_ok(
  $$insert into public.photo_trash (photo_id, date_id, path, thumb_path, deleted_with_record)
    values (gen_random_uuid(), gen_random_uuid(), 'a.jpg', 'a_thumb.jpg', false)$$,
  '42501',
  null,
  '회원은 휴지통에 행을 넣을 수 없다'
);

select throws_ok(
  $$update public.photo_trash set deleted_at = now() - interval '100 days'$$,
  '42501',
  null,
  '회원은 지운 시각을 바꿔 일찍 지워지게 할 수 없다'
);

-- a가 기록째 지운다(사진 행은 FK cascade로 함께 지워진다)
delete from public.dates where id = '10000000-0000-0000-0000-000000000001';

reset role;

select results_eq(
  $$select photo_id, record_date, record_title, deleted_with_record, deleted_by from public.photo_trash
    where date_id = '10000000-0000-0000-0000-000000000001' and deleted_with_record order by photo_id$$,
  $$values
    ('20000000-0000-0000-0000-000000000001'::uuid, '2026-11-01'::date, '성수 산책', true, '00000000-0000-0000-0000-00000000000a'::uuid),
    ('20000000-0000-0000-0000-000000000003'::uuid, '2026-11-01'::date, '성수 산책', true, '00000000-0000-0000-0000-00000000000a'::uuid)$$,
  '기록째 지우면 남은 사진이 기록 날짜·제목과 함께 한 번씩만 휴지통에 남는다'
);

select is(
  (select taken_at from public.photo_trash where photo_id = '20000000-0000-0000-0000-000000000001'),
  '2026-11-01T06:12:00Z'::timestamptz,
  '찍은 시각도 함께 남긴다'
);

select is(
  (select count(*)::int from public.photos where date_id = '10000000-0000-0000-0000-000000000001'),
  0,
  '사진 행은 그대로 지워진다'
);

-- 같은 사진 id가 다시 들어왔다가 나중에 또 지워지면 지운 시각과 기록 정보를 새로 고친다(먼저 지운 날로 30일을 세지 않게)
update public.photo_trash set deleted_at = now() - interval '20 days', record_title = '예전 제목'
  where photo_id = '20000000-0000-0000-0000-000000000003';
insert into public.dates (id, date, title, author_id) values
  ('10000000-0000-0000-0000-000000000002', '2026-11-03', '다시 쓴 기록', '00000000-0000-0000-0000-00000000000a');
insert into public.photo_groups (id, date_id, sort_order, place, place_lat, place_lng) values
  ('10000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 0, '테스트 장소', 37.5, 127.0);
insert into public.photos (id, date_id, group_id, path, thumb_path) values
  ('20000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002',
   '10000000-0000-0000-0000-000000000002/20000000-0000-0000-0000-000000000003.jpg',
   '10000000-0000-0000-0000-000000000002/20000000-0000-0000-0000-000000000003_thumb.jpg');
delete from public.photos where id = '20000000-0000-0000-0000-000000000003';

select results_eq(
  $$select date_id, record_title, deleted_at > now() - interval '1 minute' from public.photo_trash
    where photo_id = '20000000-0000-0000-0000-000000000003'$$,
  $$values ('10000000-0000-0000-0000-000000000002'::uuid, '다시 쓴 기록', true)$$,
  '같은 사진이 나중에 다시 지워지면 지운 시각과 기록 정보를 새로 고친다'
);

-- Storage: 회원은 기록 사진·휴지통 사진 파일을 지울 수 없다(캐시된 예전 앱이 바로 지우지 못하게). 저장 실패로 남은 파일은 지울 수 있다
insert into storage.objects (bucket_id, name) values
  ('album', '10000000-0000-0000-0000-000000000002/20000000-0000-0000-0000-000000000003.jpg'),
  ('album', '10000000-0000-0000-0000-000000000009/20000000-0000-0000-0000-000000000009.jpg'),
  ('album', '10000000-0000-0000-0000-000000000009/20000000-0000-0000-0000-000000000099.jpg');
insert into public.dates (id, date, title, author_id) values
  ('10000000-0000-0000-0000-000000000009', '2026-11-04', '쓰는 기록', '00000000-0000-0000-0000-00000000000a');
insert into public.photo_groups (id, date_id, sort_order, place, place_lat, place_lng) values
  ('10000000-0000-0000-0000-000000000009', '10000000-0000-0000-0000-000000000009', 0, '테스트 장소', 37.5, 127.0);
insert into public.photos (id, date_id, group_id, path, thumb_path) values
  ('20000000-0000-0000-0000-000000000009', '10000000-0000-0000-0000-000000000009', '10000000-0000-0000-0000-000000000009',
   '10000000-0000-0000-0000-000000000009/20000000-0000-0000-0000-000000000009.jpg',
   '10000000-0000-0000-0000-000000000009/20000000-0000-0000-0000-000000000009_thumb.jpg');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
-- Storage API가 지울 때처럼 직접 지우기 막음을 푼다. 회원 권한(RLS)은 그대로 적용된다
select set_config('storage.allow_delete_query', 'true', true);
delete from storage.objects where bucket_id = 'album' and name like '10000000-0000-0000-0000-00000000000_/%';
reset role;

select ok(
  exists (select 1 from storage.objects where name = '10000000-0000-0000-0000-000000000002/20000000-0000-0000-0000-000000000003.jpg'),
  '회원은 휴지통에 있는 사진 파일을 지울 수 없다'
);
select ok(
  exists (select 1 from storage.objects where name = '10000000-0000-0000-0000-000000000009/20000000-0000-0000-0000-000000000009.jpg'),
  '회원은 기록이 쓰는 사진 파일을 지울 수 없다'
);
select ok(
  not exists (select 1 from storage.objects where name = '10000000-0000-0000-0000-000000000009/20000000-0000-0000-0000-000000000099.jpg'),
  '회원은 기록·휴지통 어디에도 없는 파일(저장 실패로 남은 사진)은 지울 수 있다'
);

-- 휴지통 표를 쓰는 함수는 트리거로만 부른다
select ok(
  not has_function_privilege('authenticated', 'public.trash_deleted_photo()', 'execute')
    and not has_function_privilege('authenticated', 'public.trash_photos_of_deleted_record()', 'execute'),
  '회원은 휴지통 트리거 함수를 직접 실행할 수 없다'
);

select ok(
  not has_table_privilege('authenticated', 'public.photo_trash', 'insert, update, delete'),
  '회원에게는 휴지통 쓰기 권한이 없다'
);

select * from finish();
rollback;

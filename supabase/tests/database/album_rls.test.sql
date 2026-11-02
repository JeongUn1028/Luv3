-- 허용목록(members) 밖의 사용자는 로그인해도 기록·사진·Storage에 접근하지 못하는지 확인한다.
begin;
create extension if not exists pgtap with schema extensions;

select plan(20);

-- 준비: 허용된 두 사람(a, b)과 허용목록 밖의 사용자(outsider)
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-00000000000a', 'a@rls.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000000b', 'b@rls.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000ff', 'outsider@rls.test', 'authenticated', 'authenticated');

insert into public.members (id, email, nickname) values
  ('00000000-0000-0000-0000-00000000000a', 'a@rls.test', 'A'),
  ('00000000-0000-0000-0000-00000000000b', 'b@rls.test', 'B');

-- 비로그인(anon)
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select throws_ok(
  'select * from public.dates',
  '42501',
  null,
  '비로그인이면 기록을 조회할 권한이 없다'
);

select throws_ok(
  'select public.is_member()',
  '42501',
  null,
  '비로그인이면 is_member()를 실행할 권한이 없다'
);

-- 허용된 사용자 a
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);

select ok(public.is_member(), '허용목록에 있으면 is_member()가 true다');

select is(
  -- 로컬 DB에 이미 있는 계정과 상관없이 테스트용 두 사람만 센다
  (select count(*)::int from public.members where email like '%@rls.test'),
  2,
  '허용된 사용자는 두 사람 모두의 프로필을 본다'
);

insert into public.dates (id, date, title, place)
values ('10000000-0000-0000-0000-000000000001', '2026-11-01', '첫 데이트', '성수');

select is(
  (select author_id from public.dates where id = '10000000-0000-0000-0000-000000000001'),
  '00000000-0000-0000-0000-00000000000a'::uuid,
  '기록을 만들면 작성자가 로그인한 사용자로 자동 기록된다'
);

select throws_ok(
  $$insert into public.dates (date, title, author_id)
    values ('2026-11-01', '대신 쓰기', '00000000-0000-0000-0000-00000000000b')$$,
  '42501',
  null,
  '다른 사람을 작성자로 지정해 기록을 만들 수 없다'
);

insert into public.photos (id, date_id, path, thumb_path, sort_order) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
   '10000000-0000-0000-0000-000000000001/20000000-0000-0000-0000-000000000001.jpg',
   '10000000-0000-0000-0000-000000000001/20000000-0000-0000-0000-000000000001_thumb.jpg', 0),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001',
   '10000000-0000-0000-0000-000000000001/20000000-0000-0000-0000-000000000002.jpg',
   '10000000-0000-0000-0000-000000000001/20000000-0000-0000-0000-000000000002_thumb.jpg', 1);

update public.dates
set cover_photo_id = '20000000-0000-0000-0000-000000000001'
where id = '10000000-0000-0000-0000-000000000001';

select lives_ok(
  $$insert into storage.objects (bucket_id, name, owner)
    values ('album', '10000000-0000-0000-0000-000000000001/20000000-0000-0000-0000-000000000001.jpg',
            '00000000-0000-0000-0000-00000000000a')$$,
  '허용된 사용자는 album 버킷에 사진을 올릴 수 있다'
);

-- 허용목록 밖의 사용자
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000ff","role":"authenticated"}', true);

select ok(not public.is_member(), '허용목록에 없으면 is_member()가 false다');

select is_empty('select * from public.members', '허용목록 밖의 사용자는 프로필을 볼 수 없다');
select is_empty('select * from public.dates', '허용목록 밖의 사용자는 기록을 볼 수 없다');
select is_empty('select * from public.photos', '허용목록 밖의 사용자는 사진 정보를 볼 수 없다');

select throws_ok(
  $$insert into public.dates (date, title) values ('2026-11-01', '몰래 쓰기')$$,
  '42501',
  null,
  '허용목록 밖의 사용자는 기록을 만들 수 없다'
);

select is_empty(
  $$with changed as (
      update public.dates set title = '바꿔치기'
      where id = '10000000-0000-0000-0000-000000000001'
      returning id
    ) select id from changed$$,
  '허용목록 밖의 사용자는 기록을 고칠 수 없다'
);

select is_empty(
  $$with removed as (
      delete from public.dates
      where id = '10000000-0000-0000-0000-000000000001'
      returning id
    ) select id from removed$$,
  '허용목록 밖의 사용자는 기록을 지울 수 없다'
);

select is_empty(
  $$select name from storage.objects where bucket_id = 'album'$$,
  '허용목록 밖의 사용자는 album 버킷의 사진을 볼 수 없다'
);

select throws_ok(
  $$insert into storage.objects (bucket_id, name, owner)
    values ('album', 'sneaky.jpg', '00000000-0000-0000-0000-0000000000ff')$$,
  '42501',
  null,
  '허용목록 밖의 사용자는 album 버킷에 사진을 올릴 수 없다'
);

-- 허용된 사용자 b: 같은 앨범을 함께 본다
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);

select is(
  (select title from public.dates where id = '10000000-0000-0000-0000-000000000001'),
  '첫 데이트',
  '허용된 다른 사용자가 쓴 기록도 볼 수 있다'
);

delete from public.photos where id = '20000000-0000-0000-0000-000000000001';

select is(
  (select cover_photo_id from public.dates where id = '10000000-0000-0000-0000-000000000001'),
  null,
  '대표 사진을 지우면 기록의 대표 사진이 비워진다'
);

delete from public.dates where id = '10000000-0000-0000-0000-000000000001';

select is_empty(
  $$select id from public.photos where date_id = '10000000-0000-0000-0000-000000000001'$$,
  '기록을 지우면 딸린 사진 정보도 함께 지워진다'
);

-- buckets는 RLS로 일반 사용자에게 보이지 않으므로 관리자 권한으로 확인한다
reset role;

select is(
  (select public from storage.buckets where id = 'album'),
  false,
  'album 버킷은 private이다'
);

select * from finish();
rollback;

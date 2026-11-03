-- 커플 사진(couple_photo): 허용된 두 사람은 같은 사진 한 장을 보고, 바꾸기·지우기는 함수로만 한다.
-- 함수는 밀려난 예전 경로를 돌려줘 호출한 쪽이 파일을 지운다.
-- 비로그인·허용목록 밖 사용자는 읽지도 바꾸지도 지우지도 못하는지 확인한다.
begin;
create extension if not exists pgtap with schema extensions;

select plan(25);

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-00000000000a', 'a@couple.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000000b', 'b@couple.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000ff', 'outsider@couple.test', 'authenticated', 'authenticated');

insert into public.members (id, email, nickname) values
  ('00000000-0000-0000-0000-00000000000a', 'a@couple.test', 'A'),
  ('00000000-0000-0000-0000-00000000000b', 'b@couple.test', 'B');

-- 로컬 DB에 확인용으로 올린 사진이 남아 있어도 같은 결과가 나오게 비우고 시작한다
-- (트랜잭션 끝에 rollback하므로 실제 데이터는 그대로 남는다)
update public.couple_photo set path = null;

select has_table('public', 'couple_photo', '커플 사진 테이블이 있다');

-- 비로그인(anon)
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select throws_ok('select * from public.couple_photo', '42501', null, '비로그인이면 커플 사진을 조회할 권한이 없다');
select throws_ok(
  $$select public.set_couple_photo('couple/50000000-0000-0000-0000-000000000001.jpg')$$,
  '42501',
  null,
  '비로그인이면 커플 사진을 바꿀 권한이 없다'
);
select throws_ok('select public.clear_couple_photo()', '42501', null, '비로그인이면 커플 사진을 지울 권한이 없다');

-- 허용목록 밖 사용자
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000ff","role":"authenticated"}', true);

select is_empty('select * from public.couple_photo', '허용목록 밖 사용자는 커플 사진을 볼 수 없다');
select throws_ok(
  $$select public.set_couple_photo('couple/50000000-0000-0000-0000-000000000001.jpg')$$,
  '42501',
  null,
  '허용목록 밖 사용자는 커플 사진을 바꿀 수 없다'
);
select throws_ok('select public.clear_couple_photo()', '42501', null, '허용목록 밖 사용자는 커플 사진을 지울 수 없다');

-- a가 처음 사진을 올린다
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);

select is(
  public.set_couple_photo('couple/50000000-0000-0000-0000-000000000001.jpg'),
  null,
  '처음 올리면 지울 예전 사진이 없다'
);

-- b도 같은 사진을 보고, 다른 사진으로 바꾼다
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);

select results_eq(
  'select path from public.couple_photo',
  $$values ('couple/50000000-0000-0000-0000-000000000001.jpg')$$,
  '다른 사람이 올린 커플 사진을 함께 본다'
);
select is(
  public.set_couple_photo('couple/50000000-0000-0000-0000-000000000002.jpg'),
  'couple/50000000-0000-0000-0000-000000000001.jpg',
  '바꾸면 밀려난 예전 사진 경로를 돌려받는다'
);

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);

select results_eq(
  'select path from public.couple_photo',
  $$values ('couple/50000000-0000-0000-0000-000000000002.jpg')$$,
  '바꾼 사진이 두 사람 모두에게 보인다'
);
select is(
  public.set_couple_photo('couple/50000000-0000-0000-0000-000000000002.jpg'),
  null,
  '같은 경로로 다시 바꾸면 지금 사진을 지우라고 돌려주지 않는다'
);

select throws_ok(
  $$select public.set_couple_photo('50000000-0000-0000-0000-000000000003/x.jpg')$$,
  '23514',
  null,
  '커플 사진 폴더(couple/{uuid}.jpg)가 아닌 경로는 넣을 수 없다'
);
select throws_ok('select public.set_couple_photo(null)', '22004', null, '바꾸기에 빈 경로를 넣을 수 없다');

-- 테이블을 직접 고치면 밀려난 파일 경로를 놓치므로 함수로만 바꾼다
select throws_ok(
  $$update public.couple_photo set path = 'couple/50000000-0000-0000-0000-000000000004.jpg'$$,
  '42501',
  null,
  '커플 사진 행을 직접 고칠 수 없다'
);
select throws_ok(
  $$insert into public.couple_photo (id, path) values (true, null)$$,
  '42501',
  null,
  '커플 사진 행을 직접 추가할 수 없다'
);
select throws_ok('delete from public.couple_photo', '42501', null, '커플 사진 행을 직접 지울 수 없다');
select throws_ok(
  $$select public.swap_couple_photo_path(null)$$,
  '42501',
  null,
  '내부 함수는 직접 부를 수 없다'
);

select results_eq(
  'select path from public.couple_photo',
  $$values ('couple/50000000-0000-0000-0000-000000000002.jpg')$$,
  '막힌 시도는 커플 사진을 바꾸지 않는다'
);

-- 지우기
select is(
  public.clear_couple_photo(),
  'couple/50000000-0000-0000-0000-000000000002.jpg',
  '지우면 지울 파일 경로를 돌려받는다'
);
select results_eq(
  'select path from public.couple_photo',
  $$values (null::text)$$,
  '지운 뒤에는 커플 사진이 없다'
);
select is(public.clear_couple_photo(), null, '이미 없을 때 지우면 지울 파일이 없다');

select is(
  public.set_couple_photo('couple/50000000-0000-0000-0000-000000000005.jpg'),
  null,
  '지운 뒤 다시 올리면 지울 예전 사진이 없다'
);

reset role;

select results_eq('select count(*)::int from public.couple_photo', 'values (1)', '커플 사진 행은 늘 하나다');
select throws_ok(
  $$insert into public.couple_photo (id) values (false)$$,
  '23514',
  null,
  '두 번째 행은 만들 수 없다'
);

select * from finish();
rollback;

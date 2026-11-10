-- 사진별 한마디(photos.caption)와 데이트 전체 정리 글(dates.memo)의 길이 제한·접근 제한을 확인한다.
begin;
create extension if not exists pgtap with schema extensions;

select plan(10);

-- 준비: 허용된 두 사람(a, b)과 허용목록 밖의 사용자(outsider)
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-00000000000a', 'a@caption.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000000b', 'b@caption.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000ff', 'outsider@caption.test', 'authenticated', 'authenticated');

insert into public.members (id, email, nickname) values
  ('00000000-0000-0000-0000-00000000000a', 'a@caption.test', 'A'),
  ('00000000-0000-0000-0000-00000000000b', 'b@caption.test', 'B');

select has_column('public', 'photos', 'caption', 'photos에 사진별 한마디 컬럼이 있다');

-- 값 제약. 회원은 표를 직접 쓸 수 없으므로(#170) 표 소유자로 넣어 확인한다
insert into public.dates (id, date, title, author_id)
values ('10000000-0000-0000-0000-000000000001', '2026-11-01', '첫 데이트', '00000000-0000-0000-0000-00000000000a');

-- 바이트가 아닌 글자 수로 세는지 보려고 한글로 채운다
select lives_ok(
  $$insert into public.photos (id, date_id, path, thumb_path, caption) values
    ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
     '10000000-0000-0000-0000-000000000001/20000000-0000-0000-0000-000000000001.jpg',
     '10000000-0000-0000-0000-000000000001/20000000-0000-0000-0000-000000000001_thumb.jpg',
     repeat('가', 100))$$,
  '사진별 한마디는 100자까지 저장된다'
);

select throws_ok(
  $$insert into public.photos (date_id, path, thumb_path, caption) values
    ('10000000-0000-0000-0000-000000000001', 'x.jpg', 'x_thumb.jpg', repeat('가', 101))$$,
  '23514',
  null,
  '사진별 한마디가 100자를 넘으면 저장되지 않는다'
);

select lives_ok(
  $$insert into public.photos (date_id, path, thumb_path) values
    ('10000000-0000-0000-0000-000000000001', 'y.jpg', 'y_thumb.jpg')$$,
  '사진별 한마디 없이도 사진을 저장할 수 있다'
);

select lives_ok(
  $$update public.dates set memo = repeat('가', 10000)
    where id = '10000000-0000-0000-0000-000000000001'$$,
  '데이트 정리 글은 10,000자까지 저장된다'
);

select throws_ok(
  $$update public.dates set memo = repeat('가', 10001)
    where id = '10000000-0000-0000-0000-000000000001'$$,
  '23514',
  null,
  '데이트 정리 글이 10,000자를 넘으면 저장되지 않는다'
);

set local role authenticated;

-- 허용목록 밖의 사용자
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000ff","role":"authenticated"}', true);

select is_empty(
  $$select caption from public.photos where id = '20000000-0000-0000-0000-000000000001'$$,
  '허용목록 밖의 사용자는 사진별 한마디를 볼 수 없다'
);

select throws_ok(
  $$update public.photos set caption = '바꿔치기'
    where id = '20000000-0000-0000-0000-000000000001'$$,
  '42501',
  null,
  '허용목록 밖의 사용자는 사진별 한마디를 고칠 수 없다'
);

-- 허용된 사용자 b: 상대가 올린 사진의 한마디도 함께 보고 고친다
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);

select is(
  (select caption from public.photos where id = '20000000-0000-0000-0000-000000000001'),
  repeat('가', 100),
  '허용된 다른 사용자가 쓴 사진별 한마디도 볼 수 있다'
);

select public.update_date_record(
  '10000000-0000-0000-0000-000000000001', '2026-11-01', '첫 데이트', null, null,
  '[{"id":"20000000-0000-0000-0000-000000000001","caption":"여기 또 오자"}]', '20000000-0000-0000-0000-000000000001'
);

select is(
  (select caption from public.photos where id = '20000000-0000-0000-0000-000000000001'),
  '여기 또 오자',
  '허용된 다른 사용자가 쓴 사진별 한마디도 고칠 수 있다'
);

select * from finish();
rollback;

-- 기록 태그(#20): 저장·수정, 넘기지 않으면 유지, 비우기, 개수·글자 수·중복 제약을 확인한다.
begin;
create extension if not exists pgtap with schema extensions;

select plan(13);

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-00000000000a', 'a@tags.test', 'authenticated', 'authenticated');

insert into public.members (id, email, nickname) values
  ('00000000-0000-0000-0000-00000000000a', 'a@tags.test', 'A');

-- 예전 시그니처가 남으면 인자 수에 따라 다른 함수를 부르게 되므로 하나만 있어야 한다
select hasnt_function(
  'public', 'create_date_record',
  array['uuid', 'date', 'text', 'text', 'text', 'jsonb', 'uuid', 'date'],
  '태그 없는 예전 기록 작성 함수는 남아 있지 않다'
);
select hasnt_function(
  'public', 'update_date_record',
  array['uuid', 'date', 'text', 'text', 'text', 'jsonb', 'uuid', 'date'],
  '태그 없는 예전 기록 수정 함수는 남아 있지 않다'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);

select public.create_date_record(
  '60000000-0000-0000-0000-000000000001', '2026-11-01', '태그 있음', null,
  '[{"id":"60000000-0000-0000-0000-000000000001","location":{"place":"테스트 장소","lat":37.5,"lng":127.0},"photos":[{"id":"61000000-0000-0000-0000-000000000001"}]}]', '61000000-0000-0000-0000-000000000001', null, array['카페', '여행']
);

select is(
  (select tags from public.dates where id = '60000000-0000-0000-0000-000000000001'),
  array['카페', '여행'],
  '기록을 쓸 때 태그를 저장한다'
);

select public.create_date_record(
  '60000000-0000-0000-0000-000000000002', '2026-11-01', '태그 안 넘김', null,
  '[{"id":"60000000-0000-0000-0000-000000000002","location":{"place":"테스트 장소","lat":37.5,"lng":127.0},"photos":[{"id":"61000000-0000-0000-0000-000000000002"}]}]', '61000000-0000-0000-0000-000000000002'
);

select is(
  (select tags from public.dates where id = '60000000-0000-0000-0000-000000000002'),
  '{}'::text[],
  '태그를 넘기지 않으면 빈 목록으로 저장한다'
);

-- 예전 코드의 호출은 태그를 넘기지 않는다
select public.update_date_record(
  '60000000-0000-0000-0000-000000000001', '2026-11-01', '제목만 고침', null,
  '[{"id":"60000000-0000-0000-0000-000000000001","location":{"place":"테스트 장소","lat":37.5,"lng":127.0},"photos":[{"id":"61000000-0000-0000-0000-000000000001"}]}]', '61000000-0000-0000-0000-000000000001'
);

select is(
  (select tags from public.dates where id = '60000000-0000-0000-0000-000000000001'),
  array['카페', '여행'],
  '수정할 때 태그를 넘기지 않으면 있던 태그를 그대로 둔다'
);

select public.update_date_record(
  '60000000-0000-0000-0000-000000000001', '2026-11-01', '제목만 고침', null,
  '[{"id":"60000000-0000-0000-0000-000000000001","location":{"place":"테스트 장소","lat":37.5,"lng":127.0},"photos":[{"id":"61000000-0000-0000-0000-000000000001"}]}]', '61000000-0000-0000-0000-000000000001', null, array['전시']
);

select is(
  (select tags from public.dates where id = '60000000-0000-0000-0000-000000000001'),
  array['전시'],
  '수정할 때 태그를 바꾼다'
);

select public.update_date_record(
  '60000000-0000-0000-0000-000000000001', '2026-11-01', '제목만 고침', null,
  '[{"id":"60000000-0000-0000-0000-000000000001","location":{"place":"테스트 장소","lat":37.5,"lng":127.0},"photos":[{"id":"61000000-0000-0000-0000-000000000001"}]}]', '61000000-0000-0000-0000-000000000001', null, '{}'
);

select is(
  (select tags from public.dates where id = '60000000-0000-0000-0000-000000000001'),
  '{}'::text[],
  '빈 목록을 넘기면 태그를 다 지운다'
);

-- 제약. 회원은 표를 직접 고칠 수 없으므로(#170) 값 제약은 표 소유자로 확인한다
reset role;

select lives_ok(
  $$update public.dates set tags = array['가나다라마바사아자차', '1', '2', '3', '4'] where id = '60000000-0000-0000-0000-000000000001'$$,
  '10자 태그를 5개까지 저장한다'
);

select throws_ok(
  $$update public.dates set tags = array['1', '2', '3', '4', '5', '6'] where id = '60000000-0000-0000-0000-000000000001'$$,
  '23514', null, '태그는 5개를 넘을 수 없다'
);

select throws_ok(
  $$update public.dates set tags = array['가나다라마바사아자차카'] where id = '60000000-0000-0000-0000-000000000001'$$,
  '23514', null, '태그는 10자를 넘을 수 없다'
);

select throws_ok(
  $$update public.dates set tags = array['카페', '카페'] where id = '60000000-0000-0000-0000-000000000001'$$,
  '23514', null, '같은 태그를 두 번 넣을 수 없다'
);

select throws_ok(
  $$update public.dates set tags = array[' 카페'] where id = '60000000-0000-0000-0000-000000000001'$$,
  '23514', null, '태그 앞뒤에 공백을 둘 수 없다'
);

select throws_ok(
  $$update public.dates set tags = array[''] where id = '60000000-0000-0000-0000-000000000001'$$,
  '23514', null, '빈 태그를 넣을 수 없다'
);

select * from finish();
rollback;

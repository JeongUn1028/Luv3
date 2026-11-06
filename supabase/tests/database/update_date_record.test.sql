-- 기록 수정(update_date_record): 글·사진 목록·순서·대표 사진을 한 번에 바꾸고, 뺀 사진의 파일 경로를 돌려주는지,
-- 잘못된 요청은 아무것도 바꾸지 않는지 확인한다.
begin;
create extension if not exists pgtap with schema extensions;

select plan(12);

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-00000000000a', 'a@update.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000000b', 'b@update.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000ff', 'outsider@update.test', 'authenticated', 'authenticated');

insert into public.members (id, email, nickname) values
  ('00000000-0000-0000-0000-00000000000a', 'a@update.test', 'A'),
  ('00000000-0000-0000-0000-00000000000b', 'b@update.test', 'B');

select has_function(
  'public', 'update_date_record',
  array['uuid', 'date', 'text', 'text', 'text', 'jsonb', 'uuid', 'date', 'text[]', 'jsonb'],
  '기록 수정 함수가 있다'
);

-- a가 사진 세 장짜리 기록과 사진 한 장짜리 다른 기록을 만든다
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);

select public.create_date_record(
  '10000000-0000-0000-0000-000000000001', '2026-11-01', '첫 데이트', '성수', '하루 정리',
  '[{"id":"20000000-0000-0000-0000-000000000001","caption":"하나"},
    {"id":"20000000-0000-0000-0000-000000000002","caption":"둘"},
    {"id":"20000000-0000-0000-0000-000000000003","caption":null}]',
  '20000000-0000-0000-0000-000000000002');
select public.create_date_record(
  '10000000-0000-0000-0000-000000000009', '2026-10-01', '다른 기록', null, null,
  '[{"id":"20000000-0000-0000-0000-000000000009"}]',
  '20000000-0000-0000-0000-000000000009');

-- 비로그인(anon)
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select throws_ok(
  $$select public.update_date_record('10000000-0000-0000-0000-000000000001', '2026-11-01', '제목', null, null, '[]', null)$$,
  '42501',
  null,
  '비로그인이면 기록 수정 함수를 실행할 권한이 없다'
);

-- 다른 멤버 b가 고친다(두 사람 모두 수정할 수 있다)
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);

select results_eq(
  $$select path from unnest(public.update_date_record(
      '10000000-0000-0000-0000-000000000001', '2026-10-31', '첫 데이트(고침)', '  ', '  다시 정리  ',
      '[{"id":"20000000-0000-0000-0000-000000000003","caption":"셋 고침"},
        {"id":"20000000-0000-0000-0000-000000000004","caption":"새 사진"},
        {"id":"20000000-0000-0000-0000-000000000001","caption":""}]',
      '20000000-0000-0000-0000-000000000004')) as path order by path collate "C"$$,
  $$values
    ('10000000-0000-0000-0000-000000000001/20000000-0000-0000-0000-000000000002.jpg'),
    ('10000000-0000-0000-0000-000000000001/20000000-0000-0000-0000-000000000002_thumb.jpg')$$,
  '다른 멤버도 고칠 수 있고, 뺀 사진의 원본·썸네일 경로를 돌려준다'
);

select results_eq(
  $$select date, title, place, memo, cover_photo_id, author_id from public.dates
    where id = '10000000-0000-0000-0000-000000000001'$$,
  $$values ('2026-10-31'::date, '첫 데이트(고침)', null::text, '다시 정리',
            '20000000-0000-0000-0000-000000000004'::uuid, '00000000-0000-0000-0000-00000000000a'::uuid)$$,
  '기록 글·대표 사진이 바뀌고, 빈 장소는 null, 작성자는 그대로다'
);

select results_eq(
  $$select id, path, sort_order, caption from public.photos
    where date_id = '10000000-0000-0000-0000-000000000001' order by sort_order$$,
  $$values
    ('20000000-0000-0000-0000-000000000003'::uuid,
     '10000000-0000-0000-0000-000000000001/20000000-0000-0000-0000-000000000003.jpg', 0, '셋 고침'),
    ('20000000-0000-0000-0000-000000000004'::uuid,
     '10000000-0000-0000-0000-000000000001/20000000-0000-0000-0000-000000000004.jpg', 1, '새 사진'),
    ('20000000-0000-0000-0000-000000000001'::uuid,
     '10000000-0000-0000-0000-000000000001/20000000-0000-0000-0000-000000000001.jpg', 2, null)$$,
  '뺀 사진은 지우고, 새 사진은 규칙대로 경로를 만들고, 순서와 한마디를 바꾼다'
);

select throws_ok(
  $$select public.update_date_record('10000000-0000-0000-0000-000000000001', '2026-11-01', '사진 없음', null, null, '[]', null)$$,
  '22023',
  null,
  '사진을 모두 빼면 저장하지 않는다'
);

select throws_ok(
  $$select public.update_date_record('10000000-0000-0000-0000-000000000001', '2026-11-01', '대표 없음', null, null,
      '[{"id":"20000000-0000-0000-0000-000000000003"}]', '20000000-0000-0000-0000-000000000001')$$,
  '22023',
  null,
  '대표 사진이 목록에 없으면 저장하지 않는다'
);

select throws_ok(
  $$select public.update_date_record('10000000-0000-0000-0000-000000000001', '2026-11-01', '남의 사진', null, null,
      '[{"id":"20000000-0000-0000-0000-000000000003"},{"id":"20000000-0000-0000-0000-000000000009"}]',
      '20000000-0000-0000-0000-000000000003')$$,
  '22023',
  null,
  '다른 기록의 사진을 끌어오지 못한다'
);

select throws_ok(
  $$select public.update_date_record('10000000-0000-0000-0000-000000000001', '2026-11-01', '가'||repeat('나', 100), null, null,
      '[{"id":"20000000-0000-0000-0000-000000000003"}]', '20000000-0000-0000-0000-000000000003')$$,
  '23514',
  null,
  '제목이 100자를 넘으면 저장하지 않는다'
);

select results_eq(
  $$select (select title from public.dates where id = '10000000-0000-0000-0000-000000000001'),
           (select count(*)::int from public.photos where date_id = '10000000-0000-0000-0000-000000000001'),
           (select count(*)::int from public.photos where date_id = '10000000-0000-0000-0000-000000000009')$$,
  $$values ('첫 데이트(고침)', 3, 1)$$,
  '실패한 수정은 기록과 사진을 하나도 바꾸지 않는다'
);

select throws_ok(
  $$select public.update_date_record(gen_random_uuid(), '2026-11-01', '없는 기록', null, null,
      '[{"id":"20000000-0000-0000-0000-000000000005"}]', '20000000-0000-0000-0000-000000000005')$$,
  'P0002',
  null,
  '없는 기록은 고칠 수 없다'
);

-- 허용목록 밖 사용자는 RLS 때문에 기록이 보이지 않아 없는 기록과 같다
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000ff","role":"authenticated"}', true);

select throws_ok(
  $$select public.update_date_record('10000000-0000-0000-0000-000000000001', '2026-11-01', '침입', null, null,
      '[{"id":"20000000-0000-0000-0000-000000000003"}]', '20000000-0000-0000-0000-000000000003')$$,
  'P0002',
  null,
  '허용목록 밖 사용자는 고칠 수 없다'
);

select * from finish();
rollback;

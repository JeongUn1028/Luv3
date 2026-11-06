-- 기록 작성(create_date_record): 기록·사진 행·대표 사진을 한 번에 저장하고, 하나라도 실패하면 아무것도 남기지 않는지 확인한다.
begin;
create extension if not exists pgtap with schema extensions;

select plan(12);

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-00000000000a', 'a@create.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000ff', 'outsider@create.test', 'authenticated', 'authenticated');

insert into public.members (id, email, nickname) values
  ('00000000-0000-0000-0000-00000000000a', 'a@create.test', 'A');

select has_function(
  'public', 'create_date_record',
  array['uuid', 'date', 'text', 'text', 'text', 'jsonb', 'uuid', 'date', 'text[]', 'jsonb'],
  '기록 작성 함수가 있다'
);

-- 비로그인(anon)
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select throws_ok(
  $$select public.create_date_record(gen_random_uuid(), '2026-11-01', '제목', null, null, '[]', null)$$,
  '42501',
  null,
  '비로그인이면 기록 작성 함수를 실행할 권한이 없다'
);

-- 허용된 사용자 a
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);

select lives_ok(
  $$select public.create_date_record(
      '10000000-0000-0000-0000-000000000001', '2026-11-01', '첫 데이트', '성수', '하루 정리',
      '[{"id":"20000000-0000-0000-0000-000000000001","caption":"카페"},
        {"id":"20000000-0000-0000-0000-000000000002","caption":"  "}]',
      '20000000-0000-0000-0000-000000000002')$$,
  '허용된 사용자는 사진 두 장과 함께 기록을 만든다'
);

select results_eq(
  $$select date, title, place, memo, cover_photo_id, author_id from public.dates
    where id = '10000000-0000-0000-0000-000000000001'$$,
  $$values ('2026-11-01'::date, '첫 데이트', '성수', '하루 정리',
            '20000000-0000-0000-0000-000000000002'::uuid, '00000000-0000-0000-0000-00000000000a'::uuid)$$,
  '기록 행에 입력값·대표 사진·작성자가 저장된다'
);

select results_eq(
  $$select id, path, thumb_path, sort_order, caption from public.photos
    where date_id = '10000000-0000-0000-0000-000000000001' order by sort_order$$,
  $$values
    ('20000000-0000-0000-0000-000000000001'::uuid,
     '10000000-0000-0000-0000-000000000001/20000000-0000-0000-0000-000000000001.jpg',
     '10000000-0000-0000-0000-000000000001/20000000-0000-0000-0000-000000000001_thumb.jpg', 0, '카페'),
    ('20000000-0000-0000-0000-000000000002'::uuid,
     '10000000-0000-0000-0000-000000000001/20000000-0000-0000-0000-000000000002.jpg',
     '10000000-0000-0000-0000-000000000001/20000000-0000-0000-0000-000000000002_thumb.jpg', 1, null)$$,
  '사진 행은 고른 순서대로, 경로는 {기록 id}/{사진 id}.jpg로, 빈 한마디는 null로 저장된다'
);

select throws_ok(
  $$select public.create_date_record(gen_random_uuid(), '2026-11-01', '사진 없음', null, null, '[]', null)$$,
  '22023',
  null,
  '사진이 한 장도 없으면 저장하지 않는다'
);

select throws_ok(
  $$select public.create_date_record(gen_random_uuid(), '2026-11-01', '사진 11장', null, null,
      (select jsonb_agg(jsonb_build_object('id', gen_random_uuid())) from generate_series(1, 11)), null)$$,
  '22023',
  null,
  '사진이 10장을 넘으면 저장하지 않는다'
);

select throws_ok(
  $$select public.create_date_record(gen_random_uuid(), '2026-11-01', '대표 없음', null, null,
      '[{"id":"20000000-0000-0000-0000-000000000009"}]', '20000000-0000-0000-0000-000000000008')$$,
  '22023',
  null,
  '대표 사진이 고른 사진 중에 없으면 저장하지 않는다'
);

select throws_ok(
  $$select public.create_date_record(gen_random_uuid(), '2026-11-01', '대표 미지정', null, null,
      '[{"id":"20000000-0000-0000-0000-000000000009"}]', null)$$,
  '22023',
  null,
  '대표 사진을 정하지 않으면 저장하지 않는다'
);

select throws_ok(
  $$select public.create_date_record(
      '10000000-0000-0000-0000-000000000002', '2026-11-01', '한마디 초과', null, null,
      ('[{"id":"20000000-0000-0000-0000-000000000003","caption":"' || repeat('가', 101) || '"}]')::jsonb,
      '20000000-0000-0000-0000-000000000003')$$,
  '23514',
  null,
  '사진 한마디가 100자를 넘으면 저장하지 않는다'
);

select is_empty(
  $$select id from public.dates where id = '10000000-0000-0000-0000-000000000002'$$,
  '사진 저장이 실패하면 기록 행도 남지 않는다'
);

-- 허용목록 밖의 사용자
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000ff","role":"authenticated"}', true);

select throws_ok(
  $$select public.create_date_record(gen_random_uuid(), '2026-11-01', '몰래', null, null,
      '[{"id":"20000000-0000-0000-0000-000000000004"}]', '20000000-0000-0000-0000-000000000004')$$,
  '42501',
  null,
  '허용목록 밖의 사용자는 기록을 만들 수 없다'
);

select * from finish();
rollback;

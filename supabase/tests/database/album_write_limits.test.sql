-- 회원은 기록·사진을 저장 함수로만 만들고 고치며, 화면에만 있던 규칙을 서버에서도 확인하는지 본다(#170).
begin;
create extension if not exists pgtap with schema extensions;

select plan(34);

-- 준비: 허용된 두 사람(a, b), 허용목록 밖(outsider), 이미 지난 함께 일정 하나
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-00000000000a', 'a@limits.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000000b', 'b@limits.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000ff', 'outsider@limits.test', 'authenticated', 'authenticated');

insert into public.members (id, email, nickname) values
  ('00000000-0000-0000-0000-00000000000a', 'a@limits.test', 'A'),
  ('00000000-0000-0000-0000-00000000000b', 'b@limits.test', 'B');

insert into public.events (id, date, title, is_together, author_id) values
  ('30000000-0000-0000-0000-000000000001', '2026-11-01', '산책', true, '00000000-0000-0000-0000-00000000000a');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);

select lives_ok(
  $$select public.create_date_record(
      '10000000-0000-0000-0000-000000000001', '2026-11-01', '산책', null, null,
      '[{"id":"20000000-0000-0000-0000-000000000001"},{"id":"20000000-0000-0000-0000-000000000002"}]',
      '20000000-0000-0000-0000-000000000001')$$,
  '저장 함수로는 기록과 사진을 남긴다'
);
select is(
  (select author_id from public.dates where id = '10000000-0000-0000-0000-000000000001'),
  '00000000-0000-0000-0000-00000000000a'::uuid,
  '저장 함수로 남긴 기록의 작성자는 부른 사람이다'
);

-- 표에 직접 쓰기
select throws_ok(
  $$insert into public.dates (date, title) values ('2026-11-01', '직접 쓰기')$$,
  '42501', null, '회원도 기록 표에 직접 넣을 수 없다'
);
select throws_ok(
  $$update public.dates set author_id = '00000000-0000-0000-0000-00000000000b' where id = '10000000-0000-0000-0000-000000000001'$$,
  '42501', null, '기록의 작성자를 바꿀 수 없다'
);
select throws_ok(
  $$update public.dates set revision = gen_random_uuid() where id = '10000000-0000-0000-0000-000000000001'$$,
  '42501', null, '기록의 판 번호를 직접 바꿀 수 없다'
);
select throws_ok(
  $$update public.dates set event_id = '30000000-0000-0000-0000-000000000001', event_date = '2026-11-01'
    where id = '10000000-0000-0000-0000-000000000001'$$,
  '42501', null, '기록의 일정 연결을 직접 바꿀 수 없다'
);
select throws_ok(
  $$update public.dates set title = '바꿔치기' where id = '10000000-0000-0000-0000-000000000001'$$,
  '42501', null, '기록 내용도 저장 함수 밖에서는 고칠 수 없다'
);
select throws_ok(
  $$insert into public.photos (date_id, path, thumb_path)
    values ('10000000-0000-0000-0000-000000000001', 'other/x.jpg', 'other/x_thumb.jpg')$$,
  '42501', null, '사진 표에 직접 넣을 수 없다'
);
select throws_ok(
  $$update public.photos set path = 'other/x.jpg' where id = '20000000-0000-0000-0000-000000000002'$$,
  '42501', null, '사진 경로를 바꿀 수 없다'
);
select throws_ok(
  $$delete from public.photos where id = '20000000-0000-0000-0000-000000000002'$$,
  '42501', null, '사진 행을 직접 지울 수 없다'
);

-- 잇기·끊기 함수는 표 권한과 상관없이 그대로 쓴다
select lives_ok(
  $$select public.link_date_record('10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '2026-11-01')$$,
  '잇기 함수로는 기록을 일정에 잇는다'
);
select results_eq(
  $$select event_id, event_date from public.dates where id = '10000000-0000-0000-0000-000000000001'$$,
  $$values ('30000000-0000-0000-0000-000000000001'::uuid, '2026-11-01'::date)$$,
  '잇기 함수가 일정과 날짜를 저장한다'
);
select lives_ok(
  $$select public.unlink_date_record('10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001')$$,
  '끊기 함수로는 연결을 끊는다'
);
select results_eq(
  $$select event_id, event_date from public.dates where id = '10000000-0000-0000-0000-000000000001'$$,
  $$values (null::uuid, null::date)$$,
  '끊기 함수가 일정과 날짜를 함께 비운다'
);

-- 서버 쪽 입력 규칙: 공백 제목, 오늘(한국 날짜)까지의 날짜
select throws_ok(
  $$select public.create_date_record(gen_random_uuid(), '2026-11-01', '   ', null, null,
      '[{"id":"21000000-0000-0000-0000-000000000001"}]', '21000000-0000-0000-0000-000000000001')$$,
  '22023', null, '공백만 있는 제목으로는 기록을 남기지 않는다'
);
select throws_ok(
  $$select public.create_date_record(gen_random_uuid(), '2026-11-01', E'　\t', null, null,
      '[{"id":"21000000-0000-0000-0000-000000000002"}]', '21000000-0000-0000-0000-000000000002')$$,
  '22023', null, '전각 공백·탭만 있는 제목도 공백으로 본다'
);
select throws_ok(
  $$select public.create_date_record(gen_random_uuid(), '2026-11-01', E' ﻿', null, null,
      '[{"id":"21000000-0000-0000-0000-000000000006"}]', '21000000-0000-0000-0000-000000000006')$$,
  '22023', null, '화면(JS trim)이 공백으로 보는 NBSP·BOM만 있는 제목도 공백으로 본다'
);
select throws_ok(
  format(
    $$select public.create_date_record(gen_random_uuid(), %L, '내일', null, null,
        '[{"id":"21000000-0000-0000-0000-000000000003"}]', '21000000-0000-0000-0000-000000000003')$$,
    (now() at time zone 'Asia/Seoul')::date + 1
  ),
  '22023', null, '내일 날짜로는 기록을 남기지 않는다'
);
select throws_ok(
  format(
    $$select public.create_date_record(gen_random_uuid(), '2026-11-01', '여행', null, null,
        '[{"id":"21000000-0000-0000-0000-000000000004"}]', '21000000-0000-0000-0000-000000000004', %L)$$,
    (now() at time zone 'Asia/Seoul')::date + 1
  ),
  '22023', null, '끝 날짜가 내일이면 기록을 남기지 않는다'
);
select lives_ok(
  format(
    $$select public.create_date_record('10000000-0000-0000-0000-000000000002', %L, '오늘', null, null,
        '[{"id":"21000000-0000-0000-0000-000000000005"}]', '21000000-0000-0000-0000-000000000005')$$,
    (now() at time zone 'Asia/Seoul')::date
  ),
  '오늘 날짜로는 기록을 남긴다'
);
select throws_ok(
  $$select public.update_date_record('10000000-0000-0000-0000-000000000001', '2026-11-01', ' ', null, null,
      '[{"id":"20000000-0000-0000-0000-000000000001"}]', '20000000-0000-0000-0000-000000000001')$$,
  '22023', null, '공백만 있는 제목으로 고치지 않는다'
);
select throws_ok(
  format(
    $$select public.update_date_record('10000000-0000-0000-0000-000000000001', %L, '산책', null, null,
        '[{"id":"20000000-0000-0000-0000-000000000001"}]', '20000000-0000-0000-0000-000000000001')$$,
    (now() at time zone 'Asia/Seoul')::date + 1
  ),
  '22023', null, '내일 날짜로 고치지 않는다'
);

-- 기록 지우기는 지금처럼 표에서 직접 하고, 사진 행은 함께 지워진다
select lives_ok(
  $$delete from public.dates where id = '10000000-0000-0000-0000-000000000002'$$,
  '회원은 기록을 직접 지운다'
);
select is_empty(
  $$select id from public.photos where date_id = '10000000-0000-0000-0000-000000000002'$$,
  '기록을 지우면 사진 행도 함께 지워진다'
);

-- Storage: 앱이 만드는 경로로만 올린다
select lives_ok(
  $$insert into storage.objects (bucket_id, name, owner) values
    ('album', '10000000-0000-0000-0000-000000000001/20000000-0000-0000-0000-000000000003_thumb.jpg', '00000000-0000-0000-0000-00000000000a')$$,
  '기록 사진 경로로는 올린다'
);
select lives_ok(
  $$insert into storage.objects (bucket_id, name, owner) values
    ('album', 'couple/40000000-0000-0000-0000-000000000001.jpg', '00000000-0000-0000-0000-00000000000a')$$,
  '커플 사진 경로로는 올린다'
);
select lives_ok(
  $$insert into storage.objects (bucket_id, name, owner) values
    ('album', 'couple/40000000-0000-0000-0000-000000000001_medium.jpg', '00000000-0000-0000-0000-00000000000a')$$,
  '커플 사진의 홈 카드용 중간 크기 경로로도 올린다'
);
select throws_ok(
  $$insert into storage.objects (bucket_id, name, owner) values
    ('album', '10000000-0000-0000-0000-000000000001/20000000-0000-0000-0000-000000000004.JPG', '00000000-0000-0000-0000-00000000000a')$$,
  '42501', null, '앱이 만들지 않는 대문자 확장자로는 올리지 않는다'
);
select throws_ok(
  $$insert into storage.objects (bucket_id, name, owner) values
    ('album', 'anything/else.png', '00000000-0000-0000-0000-00000000000a')$$,
  '42501', null, '정해진 모양이 아닌 경로로는 올리지 않는다'
);
select throws_ok(
  $$insert into storage.objects (bucket_id, name, owner) values
    ('album', 'couple/40000000-0000-0000-0000-00000000000A.jpg', '00000000-0000-0000-0000-00000000000a')$$,
  '42501', null, '커플 사진 경로는 소문자 id만 받는다'
);
select is_empty(
  $$with moved as (
      update storage.objects set name = '10000000-0000-0000-0000-000000000001/20000000-0000-0000-0000-000000000009.jpg'
      where bucket_id = 'album' and name = 'couple/40000000-0000-0000-0000-000000000001.jpg'
      returning name
    ) select name from moved$$,
  '올린 파일을 덮어쓰거나 옮기지 못한다'
);

-- 닉네임
select throws_ok(
  $$update public.members set nickname = '함께' where id = '00000000-0000-0000-0000-00000000000a'$$,
  '42501', null, '일정 구분에 쓰는 함께는 닉네임으로 저장하지 않는다'
);
select throws_ok(
  $$update public.members set nickname = E'ㅤ​' where id = '00000000-0000-0000-0000-00000000000a'$$,
  '42501', null, '보이지 않는 문자만 있는 닉네임은 저장하지 않는다'
);
select lives_ok(
  $$update public.members set nickname = 'ㅎㅎ' where id = '00000000-0000-0000-0000-00000000000a'$$,
  '보이는 글자가 있는 닉네임은 저장한다'
);

select * from finish();
rollback;

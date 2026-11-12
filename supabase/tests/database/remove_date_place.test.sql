-- 기록 장소 지우기(#296): 칸과 좌표를 받던 예전 저장 함수가 남아 있지 않은지 확인한다. 장소 인자는 사진 모음(#297)에서 뺐다(photo_groups.test.sql).
begin;
create extension if not exists pgtap with schema extensions;

select plan(5);

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

select * from finish();
rollback;

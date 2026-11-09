-- 기록이 어느 일정의 어느 날에서 왔는지 남긴다(#227, #199). 직접 쓴 기록은 둘 다 비어 있다.
-- 날짜는 반복 일정이면 그날, 아니면 일정의 시작일이다. 반복 일정은 날마다 기록을 하나씩 잇는다.
-- 일정을 지워도 사진과 글을 잃으면 안 되므로 기록은 남기고 연결만 끊는다.
alter table public.dates
  add column event_id uuid references public.events (id) on delete set null,
  add column event_date date,
  add constraint dates_event_link_pair check ((event_id is null) = (event_date is null)),
  -- 같은 일정의 같은 날에는 기록이 하나만 생긴다. 일정 id가 앞이라 일정으로 찾는 조회에도 쓴다
  add constraint dates_event_link_key unique (event_id, event_date);

-- 일정을 지워 event_id가 비면 날짜도 함께 비운다(외래 키는 자기 칸만 비운다)
create function public.clear_date_event_date()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.event_id is null then
    new.event_date := null;
  end if;
  return new;
end;
$$;

create trigger dates_clear_event_date
  before update of event_id on public.dates
  for each row execute function public.clear_date_event_date();

-- 시그니처가 바뀌어 그대로 두면 두 함수가 함께 남는다. 지우고 다시 만들므로 실행 권한도 다시 준다.
drop function public.create_date_record(uuid, date, text, text, text, jsonb, uuid, date, text[], jsonb);

-- 연결 인자는 맨 뒤에 기본값으로 둔다. 운영 DB에 먼저 적용한 뒤 새 코드가 배포될 때까지 예전 코드의 호출도 그대로 동작한다.
create function public.create_date_record(
  p_id uuid,
  p_date date,
  p_title text,
  p_place text,
  p_memo text,
  p_photos jsonb,
  p_cover_photo_id uuid,
  p_end_date date default null,
  p_tags text[] default null,
  p_place_location jsonb default null,
  p_event_id uuid default null,
  p_event_date date default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  photo_count int;
  violated text;
  linked_id uuid;
begin
  photo_count := case when jsonb_typeof(p_photos) = 'array' then jsonb_array_length(p_photos) else 0 end;
  if photo_count not between 1 and 10 then
    raise exception '사진은 1장 이상 10장 이하로 올립니다: %장', photo_count using errcode = '22023';
  end if;

  if p_cover_photo_id is null or not exists (
    select 1 from jsonb_array_elements(p_photos) as photo where (photo ->> 'id')::uuid = p_cover_photo_id
  ) then
    raise exception '대표 사진은 올린 사진 중에서 고릅니다' using errcode = '22023';
  end if;

  -- 같은 id는 앞선 시도가 저장했다는 뜻이다(앱이 23505로 알아챈다, #157). 연결 중복(P0410)보다 먼저 알린다
  if exists (select 1 from public.dates where id = p_id) then
    raise exception '이미 저장된 기록입니다: %', p_id using errcode = '23505';
  end if;

  -- 작성 화면 주소는 손으로 바꿀 수 있고 쓰는 사이 일정이 지워질 수 있다. 없는 일정이면 연결 없이 남긴다
  if p_event_id is null or p_event_date is null or not exists (select 1 from public.events where id = p_event_id) then
    p_event_id := null;
    p_event_date := null;
  end if;

  begin
    insert into public.dates (id, date, end_date, title, place, memo, tags, place_lat, place_lng, event_id, event_date)
    values (
      p_id, p_date, p_end_date, p_title, nullif(btrim(p_place), ''), nullif(btrim(p_memo), ''), coalesce(p_tags, '{}'),
      (p_place_location ->> 'lat')::double precision, (p_place_location ->> 'lng')::double precision,
      p_event_id, p_event_date
    );
  exception when unique_violation then
    get stacked diagnostics violated = constraint_name;
    if violated is distinct from 'dates_event_link_key' then
      raise;
    end if;
    -- 그 일정의 그날에 이미 남긴 기록이 있다. 앱이 그 기록으로 안내하도록 id를 함께 알린다.
    -- 그사이 그 기록이 지워졌으면 빈 글자로 알린다(raise의 detail은 null을 받지 않는다)
    select id into linked_id from public.dates where event_id = p_event_id and event_date = p_event_date;
    raise exception '이 일정의 그날에는 이미 기록이 있습니다' using errcode = 'P0410', detail = coalesce(linked_id::text, '');
  end;

  -- 경로는 클라이언트가 보낸 값을 믿지 않고 업로드 규칙({기록 id}/{사진 id}.jpg)대로 만든다
  insert into public.photos (id, date_id, path, thumb_path, sort_order, caption)
  select
    (photo ->> 'id')::uuid,
    p_id,
    p_id || '/' || (photo ->> 'id') || '.jpg',
    p_id || '/' || (photo ->> 'id') || '_thumb.jpg',
    (position - 1)::int,
    nullif(btrim(photo ->> 'caption'), '')
  from jsonb_array_elements(p_photos) with ordinality as item (photo, position);

  update public.dates set cover_photo_id = p_cover_photo_id where id = p_id;

  return p_id;
end;
$$;

revoke execute on function public.create_date_record(uuid, date, text, text, text, jsonb, uuid, date, text[], jsonb, uuid, date) from public, anon;
grant execute on function public.create_date_record(uuid, date, text, text, text, jsonb, uuid, date, text[], jsonb, uuid, date) to authenticated;

-- 반복 중 하루만 고치면 그날에 이어 둔 기록은 떼어 낸 일정을 따라간다(사용자 결정, #199). 나머지는 20261106010000과 같다.
create or replace function public.detach_event_occurrence(
  p_event_id uuid,
  p_occurrence_date date,
  p_date date,
  p_title text,
  p_start_time time default null,
  p_place text default null,
  p_memo text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  parent public.events%rowtype;
  new_id uuid;
begin
  if not public.is_member() then
    raise exception '허용된 사용자만 일정을 고칠 수 있습니다' using errcode = '42501';
  end if;

  select * into parent from public.events where id = p_event_id and repeat_rule is not null for key share;
  if not found then
    raise exception '반복 일정을 찾을 수 없습니다: %', p_event_id using errcode = 'P0002';
  end if;

  insert into public.event_exceptions (event_id, date)
  values (p_event_id, p_occurrence_date)
  on conflict do nothing;
  if not found then
    raise exception '이미 건너뛴 날입니다: %', p_occurrence_date using errcode = 'P0002';
  end if;

  insert into public.events (date, start_time, title, place, memo, is_together, author_id, repeat_parent_id)
  values (p_date, p_start_time, p_title, p_place, p_memo, parent.is_together, parent.author_id, p_event_id)
  returning id into new_id;

  -- 떼어 낸 일정은 반복이 아니라 시작일이 곧 연결 날짜다
  update public.dates set event_id = new_id, event_date = p_date
  where event_id = p_event_id and event_date = p_occurrence_date;

  return new_id;
end;
$$;

-- 기존 기록은 함께 일정의 제목과 날짜(반복이면 그날)가 정확히 맞는 짝이 하나뿐일 때만 잇는다. 애매하면 그대로 둔다.
-- 반복 날짜는 앱(recurrence.ts)과 같게 시작일에서 n주·n달·n년 뒤로 센다. 달·해를 더하면 없는 날은 그 달 마지막 날이 된다.
with candidates as (
  select record.id as date_id, event.id as event_id, record.date as event_date
  from public.dates as record
  join public.events as event on event.is_together and event.title = record.title
  where
    (event.repeat_rule is null and event.date = record.date)
    or (
      event.repeat_rule is not null
      and record.date >= event.date
      and (event.repeat_until is null or record.date <= event.repeat_until)
      and not exists (select 1 from public.event_exceptions as skipped where skipped.event_id = event.id and skipped.date = record.date)
      and case event.repeat_rule
        when 'weekly' then (record.date - event.date) % 7 = 0
        when 'monthly' then (event.date + make_interval(months =>
          ((extract(year from record.date) - extract(year from event.date)) * 12 + extract(month from record.date) - extract(month from event.date))::int
        ))::date = record.date
        when 'yearly' then (event.date + make_interval(years => (extract(year from record.date) - extract(year from event.date))::int))::date = record.date
        else false
      end
    )
),
unique_pairs as (
  select candidate.*
  from candidates as candidate
  where (select count(*) from candidates as other where other.date_id = candidate.date_id) = 1
    and (select count(*) from candidates as other where other.event_id = candidate.event_id and other.event_date = candidate.event_date) = 1
)
update public.dates as record
set event_id = unique_pairs.event_id, event_date = unique_pairs.event_date
from unique_pairs
where record.id = unique_pairs.date_id;

-- 이미 쓴 기록을 일정의 그날에 잇고, 잘못 이었으면 연결만 끊는다(#237).
-- 기록 작성(create_date_record)으로만 잇던 것을, 기록 탭에서 바로 쓴 기록이나 자동 연결(20261109010000)에서 빠진 기록에도 쓸 수 있게 한다.
-- 두 함수는 판 번호(revision)를 바꾸지 않는다. 연결은 기록 고치기 화면이 저장하는 칸이 아니라서, 열어 둔 고치기 화면의 저장을 막을 까닭이 없다.

-- 함께 일정의 그날(반복이면 오는 날, 아니면 시작일)에 기록을 잇는다. 앱의 "기록 남기기"와 같은 조건이다.
-- 일정은 오늘(한국 날짜)까지 끝났어야 하고, 기록 기간은 그 일정의 날(기간 일정이면 기간)과 겹쳐야 한다.
create function public.link_date_record(p_date_id uuid, p_event_id uuid, p_event_date date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  linked_event public.events%rowtype;
  target public.dates%rowtype;
  is_event_day boolean;
  event_end date;
  violated text;
  linked_id uuid;
begin
  if not public.is_member() then
    raise exception '허용된 사용자만 기록을 이을 수 있습니다' using errcode = '42501';
  end if;

  -- 잇는 사이 일정이 지워지지 않게 잡아 둔다
  select * into linked_event from public.events where id = p_event_id for key share;
  if not found then
    raise exception '일정을 찾을 수 없습니다: %', p_event_id using errcode = 'P0002';
  end if;
  if not linked_event.is_together then
    raise exception '함께 일정에만 기록을 잇습니다' using errcode = '22023';
  end if;
  -- 그날이 일정이 있는 날인지: 반복이 아니면 시작일, 반복이면 실제로 오는 날(끝나는 날·건너뛴 날 반영).
  -- 반복 날짜는 앱(recurrence.ts)과 같게 시작일에서 n주·n달·n년 뒤로 센다. 달·해를 더해 없는 날은 그 달 마지막 날이 된다(20261109010000과 같다)
  is_event_day := case
    when linked_event.repeat_rule is null then p_event_date = linked_event.date
    else
      p_event_date >= linked_event.date
      and (linked_event.repeat_until is null or p_event_date <= linked_event.repeat_until)
      and not exists (select 1 from public.event_exceptions as skipped where skipped.event_id = p_event_id and skipped.date = p_event_date)
      and case linked_event.repeat_rule
        when 'weekly' then (p_event_date - linked_event.date) % 7 = 0
        when 'monthly' then (linked_event.date + make_interval(months =>
          ((extract(year from p_event_date) - extract(year from linked_event.date)) * 12
            + extract(month from p_event_date) - extract(month from linked_event.date))::int
        ))::date = p_event_date
        when 'yearly' then (linked_event.date + make_interval(years =>
          (extract(year from p_event_date) - extract(year from linked_event.date))::int
        ))::date = p_event_date
        else false
      end
  end;
  if p_event_date is null or not is_event_day then
    raise exception '그날은 이 일정의 날이 아닙니다: %', p_event_date using errcode = '22023';
  end if;
  -- 기간 일정은 반복과 함께 쓰지 않으므로(DB 제약) 끝 날짜가 있으면 시작일(= 연결 날짜)부터의 기간이다
  event_end := coalesce(linked_event.end_date, p_event_date);
  if event_end > (now() at time zone 'Asia/Seoul')::date then
    raise exception '아직 지나지 않은 일정에는 기록을 잇지 않습니다' using errcode = '22023';
  end if;

  select * into target from public.dates where id = p_date_id for update;
  if not found then
    raise exception '기록을 찾을 수 없습니다' using errcode = 'P0002';
  end if;
  -- 두 번 누르거나 응답만 끊겨 다시 보내도 같은 결과로 끝낸다
  if target.event_id = p_event_id and target.event_date = p_event_date then
    return;
  end if;
  if target.event_id is not null then
    raise exception '이미 다른 일정과 이어진 기록입니다' using errcode = 'P0411';
  end if;
  if target.date > event_end or coalesce(target.end_date, target.date) < p_event_date then
    raise exception '기록 날짜가 일정 날짜와 겹치지 않습니다' using errcode = '22023';
  end if;

  -- 반복이 아닌 일정은 날짜를 옮겨도 같은 일이다. 옮기기 전 날짜로 이어진 기록이 있으면 그 기록이 이 일정의 기록이다(앱의 findLinkedRecordId와 같다)
  if linked_event.repeat_rule is null then
    select id into linked_id from public.dates where event_id = p_event_id and id <> p_date_id order by event_date limit 1;
    if found then
      raise exception '이 일정에는 이미 기록이 있습니다' using errcode = 'P0410', detail = linked_id::text;
    end if;
  end if;

  begin
    update public.dates set event_id = p_event_id, event_date = p_event_date where id = p_date_id;
  exception when unique_violation then
    get stacked diagnostics violated = constraint_name;
    if violated is distinct from 'dates_event_link_key' then
      raise;
    end if;
    -- create_date_record와 같다: 그 일정의 그날에 이미 이어진 기록이 있으면 그 id를 알린다(지워졌으면 빈 글자)
    select id into linked_id from public.dates where event_id = p_event_id and event_date = p_event_date;
    raise exception '이 일정의 그날에는 이미 기록이 있습니다' using errcode = 'P0410', detail = coalesce(linked_id::text, '');
  end;
end;
$$;

revoke execute on function public.link_date_record(uuid, uuid, date) from public, anon;
grant execute on function public.link_date_record(uuid, uuid, date) to authenticated;

-- 기록과 일정은 그대로 두고 연결만 끊는다. 날짜는 dates_clear_event_date 트리거가 함께 비운다.
-- 화면이 본 일정을 함께 받아, 그사이 다른 일정에 다시 이은 연결은 끊지 않는다. 이미 끊긴 연결은 그대로 끝낸다
create function public.unlink_date_record(p_date_id uuid, p_event_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_member() then
    raise exception '허용된 사용자만 연결을 끊을 수 있습니다' using errcode = '42501';
  end if;

  update public.dates set event_id = null where id = p_date_id and event_id = p_event_id;
  if not found and not exists (select 1 from public.dates where id = p_date_id) then
    raise exception '기록을 찾을 수 없습니다' using errcode = 'P0002';
  end if;
end;
$$;

revoke execute on function public.unlink_date_record(uuid, uuid) from public, anon;
grant execute on function public.unlink_date_record(uuid, uuid) to authenticated;

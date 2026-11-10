-- 기록 찾기와 태그 줄을 서버에서 한다(#273).
-- 예전에는 기록 탭이 모든 기록의 정리 글·사진 한마디를 내려받아 휴대폰에서 걸렀다. 기록을 나눠 읽으면(#274) 휴대폰에는 일부만 있으므로 DB에서 찾는다.
-- 두 함수 모두 부르는 사람의 권한으로 돈다(security invoker). 회원이 아니면 RLS가 기록을 하나도 보여 주지 않는다.

-- 검색어 낱말과 태그에 맞는 기록을 최신순(날짜 → 작성 시각 → id)으로 p_limit개 돌려준다.
-- 낱말은 모두 제목·장소·정리 글·사진 한마디·태그 중 어딘가에 들어 있어야 한다(대소문자 무시 부분 일치, % _ 도 글자 그대로).
-- 태그는 대소문자만 무시하고 정확히 같아야 한다. 다음 묶음은 앞 묶음 마지막 기록의 (날짜, 작성 시각, id)를 넘겨 그 뒤부터 받는다.
-- total_count는 묶음과 상관없이 맞는 기록 전체의 수다.
create function public.search_date_records(
  p_words text[] default '{}',
  p_tag text default null,
  p_before_date date default null,
  p_before_created_at timestamptz default null,
  p_before_id uuid default null,
  p_limit int default 60
)
returns table (
  id uuid,
  date date,
  end_date date,
  title text,
  place text,
  tags text[],
  thumb_path text,
  created_at timestamptz,
  total_count bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  with matched as (
    select d.id, d.date, d.end_date, d.title, d.place, d.tags, d.created_at, d.cover_photo_id
    from public.dates as d
    cross join lateral (
      select lower(concat_ws(
        e'\n',
        d.title,
        d.place,
        d.memo,
        (select string_agg(p.caption, e'\n') from public.photos as p where p.date_id = d.id),
        array_to_string(d.tags, e'\n')
      )) as body
    ) as searched
    where (p_tag is null or exists (select 1 from unnest(d.tags) as t(tag) where lower(t.tag) = lower(p_tag)))
      and not exists (
        select 1 from unnest(coalesce(p_words, '{}')) as w(word) where strpos(searched.body, lower(w.word)) = 0
      )
  )
  select m.id, m.date, m.end_date, m.title, m.place, m.tags, cover.thumb_path, m.created_at,
    (select count(*) from matched) as total_count
  from matched as m
  left join public.photos as cover on cover.id = m.cover_photo_id
  where p_before_date is null
    or (m.date, m.created_at, m.id) < (p_before_date, p_before_created_at, p_before_id)
  order by m.date desc, m.created_at desc, m.id desc
  limit least(greatest(coalesce(p_limit, 60), 1), 100);
$$;

revoke execute on function public.search_date_records(text[], text, date, timestamptz, uuid, int) from public, anon;
grant execute on function public.search_date_records(text[], text, date, timestamptz, uuid, int) to authenticated;

-- 기록들의 태그를 대소문자를 무시하고 묶어 쓴 수를 센다(기록 탭 태그 줄, 작성 화면 추천).
-- 대소문자만 다른 태그는 하나로 세고, 그중 정렬상 앞선 글자를 보여 준다. 순서는 앱이 정한다(많이 쓴 순 → 가나다순).
create function public.count_date_tags()
returns table (tag text, count bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select min(t.tag), count(*)
  from public.dates as d
  cross join unnest(d.tags) as t(tag)
  group by lower(t.tag);
$$;

revoke execute on function public.count_date_tags() from public, anon;
grant execute on function public.count_date_tags() to authenticated;

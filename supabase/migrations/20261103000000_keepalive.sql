-- Supabase 무료 플랜은 7일 동안 요청이 없으면 프로젝트를 일시정지한다. Vercel Cron이 하루 한 번 이 함수를 불러 DB를 깨워 둔다.
-- 비로그인(anon)으로 부르지만 DB 시각만 돌려주고 어떤 테이블도 읽지 않는다. 테이블 권한·RLS는 그대로다.
create function public.keepalive()
returns timestamptz
language sql
stable
security invoker
set search_path = ''
as $$
  select now();
$$;

-- Supabase 기본 권한이 새 함수에 anon·authenticated 실행 권한을 이미 주지만, 비로그인 호출이 의도라는 것을 남긴다.
grant execute on function public.keepalive() to anon, authenticated;

-- 회원(authenticated)에게 남아 있던, RLS를 건너뛰거나 앱이 쓰지 않는 권한을 거둔다(#255).
-- TRUNCATE는 RLS를 거치지 않아 허용목록 밖의 사용자도 표를 비울 수 있는 권한이다. 앱(PostgREST)은
-- TRUNCATE를 보내지 않지만, comments(#18)·dates·photos(#170)처럼 쓰지 않는 권한은 모두 뺀다.
-- references·trigger도 앱이 쓰지 않는다. security_baseline.test.sql이 새 표에서도 이 규칙을 확인한다.
revoke truncate, references, trigger on table
  public.events,
  public.event_exceptions,
  public.members,
  public.todos
from authenticated;

-- 할 일 순서 번호는 추가할 때 기본값(nextval)으로만 쓴다. select·update가 있으면 setval로 번호를 되돌려
-- move_todo가 기대는 "순서 값은 겹치지 않는다"를 깨뜨릴 수 있다. nextval에는 usage만 있으면 된다
revoke select, update on sequence public.todos_sort_order_seq from authenticated;

-- 위 권한들은 Supabase 기본 권한(default privileges)이 표·시퀀스를 만들 때마다 다시 붙인다.
-- 마이그레이션은 postgres로 실행되므로 postgres가 public에 만드는 것부터 붙지 않게 한다.
-- 표마다 필요한 권한은 지금처럼 그 표의 마이그레이션에서 준다.
-- 함수 실행 권한은 PostgreSQL이 모든 스키마에서 PUBLIC에 주는 것이라 여기서 거둘 수 없어, 함수마다 회수하고 테스트로 확인한다
alter default privileges for role postgres in schema public
  revoke truncate, references, trigger on tables from authenticated;
alter default privileges for role postgres in schema public
  revoke all on tables from anon;
alter default privileges for role postgres in schema public
  revoke select, update on sequences from authenticated;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon;

import type { Metadata } from "next";
import { LoadErrorMessage } from "@/components/LoadErrorMessage";
import { LoadingSuspense } from "@/components/LoadingSuspense";
import { TabScreen } from "@/components/tabs/TabScreen";
import { TodoAddLink } from "@/components/todos/TodoAddLink";
import { TodoList } from "@/components/todos/TodoList";
import { TodoListSkeleton } from "@/components/todos/TodoListSkeleton";
import { toKstDate } from "@/lib/anniversary";
import { withCurrentMember } from "@/lib/auth/with-member";
import { catchLoadError } from "@/lib/load";
import { getTodos, TodoLoadError } from "@/lib/todos/queries";

export const metadata: Metadata = { title: "하고 싶은 것 · Luv3" };

/** 탭을 오갈 때 받은 지 이 시간(초)이 안 됐으면 서버에 다시 묻지 않는다(#405). `STALE_AFTER_MS`와 같아야 한다. 저장·지우기 뒤의 router.refresh()는 받아 둔 화면을 비운다 */
export const unstable_dynamicStaleTime = 30;

const TodosContent = async () => {
  // 허용목록 밖 계정은 여기서 로그아웃 처리 경로로 보낸다. 확인과 조회는 함께 시작한다(#344)
  // 목록을 못 불러와도 머리글과 하단 탭은 쓸 수 있게, 이 에러만 화면 안 문구로 바꾼다
  const [, todos] = await withCurrentMember(() => catchLoadError(getTodos, TodoLoadError));

  if (todos instanceof TodoLoadError) return <LoadErrorMessage message={todos.message} />;
  // 이어진 일정이 지났는지 가르는 오늘. 서버와 브라우저가 같은 값으로 그리게 서버에서 정한다
  return <TodoList todos={todos} today={toKstDate(new Date())} />;
};

const TodosPage = () => (
  <TabScreen
    tab="todos"
    title="하고 싶은 것"
    actions={<TodoAddLink />}
    className="px-4"
  >
    {/* 세션을 읽는 부분만 요청 때 그린다(cacheComponents) */}
    <LoadingSuspense fallback={<TodoListSkeleton />}>
      <TodosContent />
    </LoadingSuspense>
  </TabScreen>
);

export default TodosPage;

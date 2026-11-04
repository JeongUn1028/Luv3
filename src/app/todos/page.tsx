import type { Metadata } from "next";
import { PlusIcon } from "@/components/icons";
import { LoadingSuspense } from "@/components/LoadingSuspense";
import { ScreenHeaderLink } from "@/components/ScreenHeader";
import { TabScreen } from "@/components/tabs/TabScreen";
import { TodoList } from "@/components/todos/TodoList";
import { TodoListSkeleton } from "@/components/todos/TodoListSkeleton";
import { getCurrentMember } from "@/lib/auth/member";
import { catchLoadError } from "@/lib/load";
import { TODOS_PATH } from "@/lib/todos/list";
import { getTodos, TodoLoadError } from "@/lib/todos/queries";

export const metadata: Metadata = { title: "Todo · Luv3" };

const TodosContent = async () => {
  // 허용목록 밖 계정은 여기서 로그아웃 처리 경로로 보낸다
  await getCurrentMember();
  // 목록을 못 불러와도 머리글과 하단 탭은 쓸 수 있게, 이 에러만 화면 안 문구로 바꾼다
  const todos = await catchLoadError(getTodos, TodoLoadError);

  if (todos instanceof TodoLoadError) {
    return (
      <div className="flex flex-1 items-center justify-center py-12">
        <p role="alert" className="text-[13px] text-ink-sub">
          {todos.message}
        </p>
      </div>
    );
  }
  return <TodoList todos={todos} />;
};

const TodosPage = () => (
  <TabScreen
    tab="todos"
    title="Todo"
    actions={
      <ScreenHeaderLink href={`${TODOS_PATH}/new`} label="하고 싶은 것 추가">
        <PlusIcon className="size-6" />
      </ScreenHeaderLink>
    }
    className="px-4"
  >
    {/* 세션을 읽는 부분만 요청 때 그린다(cacheComponents) */}
    <LoadingSuspense fallback={<TodoListSkeleton />}>
      <TodosContent />
    </LoadingSuspense>
  </TabScreen>
);

export default TodosPage;

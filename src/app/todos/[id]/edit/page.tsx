import type { Metadata } from "next";
import { FormSkeleton } from "@/components/FormSkeleton";
import { LoadErrorScreen } from "@/components/LoadErrorScreen";
import { StatusLink, StatusScreen } from "@/components/StatusScreen";
import { LoadingSuspense } from "@/components/LoadingSuspense";
import { TodoForm } from "@/components/todos/TodoForm";
import { getCurrentMember } from "@/lib/auth/member";
import { catchLoadError } from "@/lib/load";
import { TODOS_PATH } from "@/lib/todos/list";
import { getTodo, TodoLoadError } from "@/lib/todos/queries";

export const metadata: Metadata = { title: "하고 싶은 것 고치기 · Luv3" };

const EditTodoForm = async ({ params }: { params: Promise<{ id: string }> }) => {
  // 허용목록 밖 계정은 여기서 로그아웃 처리 경로로 보낸다
  await getCurrentMember();
  const { id } = await params;

  const todo = await catchLoadError(() => getTodo(id), TodoLoadError);

  if (todo instanceof TodoLoadError) {
    return <LoadErrorScreen title="항목을 불러오지 못했어요" backHref={TODOS_PATH} backLabel="목록으로" />;
  }

  if (!todo) {
    return (
      <StatusScreen title="항목을 찾을 수 없어요" description="지워졌거나 주소가 잘못됐어요.">
        <StatusLink href={TODOS_PATH}>목록으로</StatusLink>
      </StatusScreen>
    );
  }

  // cacheComponents는 다녀온 화면의 상태를 보존해, 다시 열면 예전 입력값이 남는다. 요청마다 새 key로 최신 값을 채운다
  return (
    <TodoForm
      key={crypto.randomUUID()}
      todoId={todo.id}
      initialContent={todo.content}
    />
  );
};

const EditTodoPage = ({ params }: PageProps<"/todos/[id]/edit">) => (
  // 주소의 id와 세션은 요청 때만 알 수 있어 Suspense 안에서 읽는다(cacheComponents)
  <LoadingSuspense fallback={<FormSkeleton back={{ href: TODOS_PATH }} title="하고 싶은 것 고치기" fieldCount={1} />}>
    <EditTodoForm params={params} />
  </LoadingSuspense>
);

export default EditTodoPage;

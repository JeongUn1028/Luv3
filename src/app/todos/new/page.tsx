import type { Metadata } from "next";
import { FormSkeleton } from "@/components/FormSkeleton";
import { LoadingSuspense } from "@/components/LoadingSuspense";
import { TodoForm } from "@/components/todos/TodoForm";
import { getCurrentMember } from "@/lib/auth/member";
import { TODOS_PATH } from "@/lib/todos/list";

export const metadata: Metadata = { title: "하고 싶은 것 추가 · Luv3" };

const NewTodoForm = async () => {
  // 허용목록 밖 계정은 여기서 로그아웃 처리 경로로 보낸다
  await getCurrentMember();
  // cacheComponents는 다녀온 화면의 상태를 보존해, 다시 열면 예전 입력값이 남는다. 요청마다 새 key로 새 폼을 만든다
  return <TodoForm key={crypto.randomUUID()} initialContent="" />;
};

const NewTodoPage = () => (
  // 세션은 요청 때만 알 수 있어 Suspense 안에서 읽는다(cacheComponents)
  <LoadingSuspense fallback={<FormSkeleton back={{ href: TODOS_PATH }} title="하고 싶은 것 추가" fieldCount={1} />}>
    <NewTodoForm />
  </LoadingSuspense>
);

export default NewTodoPage;

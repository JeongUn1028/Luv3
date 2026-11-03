import Link from "next/link";
import type { ReactElement } from "react";
import { AuthorHeart } from "@/components/AuthorHeart";
import { TODOS_PATH, type Todo } from "@/lib/todos/list";

interface TodoPreviewProps {
  /** 하지 않은 항목 맨 위 몇 개(`groupTodos(todos).open.slice(0, 3)`) */
  todos: Todo[];
}

/** 홈의 하고 싶은 것 미리보기. 줄을 누르면 Todo 탭으로 간다 */
export const TodoPreview = ({ todos }: TodoPreviewProps): ReactElement => (
  <ul className="flex flex-col gap-1.5">
    {todos.map((todo) => (
      <li key={todo.id}>
        <Link href={TODOS_PATH} className="flex min-h-11 items-center gap-3 rounded-[10px] bg-surface py-0.5 pr-2 pl-3">
          <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-highlight" />
          <span className="min-w-0 flex-1 truncate text-[14px] text-ink">{todo.content}</span>
          {todo.authorNickname && <AuthorHeart nickname={todo.authorNickname} />}
        </Link>
      </li>
    ))}
  </ul>
);

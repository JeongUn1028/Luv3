import Link from "next/link";
import { useId, type ReactElement } from "react";
import { FORWARD_TRANSITION, TAB_TRANSITION } from "@/lib/navigation/transition";
import { TODOS_PATH, type Todo } from "@/lib/todos/list";

interface TodoPreviewProps {
  /** 하지 않은 항목 맨 위 몇 개(`groupTodos(todos).open.slice(0, 3)`) */
  todos: Todo[];
  /** 불러오기 실패 문구. 있으면 `todos` 대신 보여 준다 */
  errorMessage?: string;
}

/**
 * 홈의 하고 싶은 것 한 줄 카드. 항목을 점과 함께 가로로 잇고, 줄이 넘치면 끝을 "…"로 줄인다.
 * 링크가 카드 전체를 덮어 어디를 눌러도 Todo 탭(비었으면 추가 화면)으로 간다.
 *
 * @example <TodoPreview todos={groupTodos(todos).open.slice(0, 3)} />
 */
export const TodoPreview = ({ todos, errorMessage }: TodoPreviewProps): ReactElement => {
  const titleId = useId();
  const isEmpty = !errorMessage && todos.length === 0;

  return (
    <section aria-labelledby={titleId} className="press-card-group relative mt-4 shrink-0 rounded-[16px] bg-surface px-3.5 py-3">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id={titleId} className="font-display text-[14px] leading-5 text-ink">
          하고 싶은 것
        </h2>
        {!isEmpty && (
          <Link href={TODOS_PATH} transitionTypes={TAB_TRANSITION} className="text-[12px] leading-4 text-ink-sub after:absolute after:inset-0 after:rounded-[16px]">
            <span className="sr-only">하고 싶은 것 </span>모두 보기
          </Link>
        )}
      </div>
      {errorMessage ? (
        <p role="alert" className="mt-2 text-[13px] leading-5 text-ink-sub">
          {errorMessage}
        </p>
      ) : isEmpty ? (
        <div className="mt-2 flex items-center justify-between gap-3">
          <p className="min-w-0 text-[13px] leading-5 text-ink-sub">함께 하고 싶은 것을 적어 보세요</p>
          <Link
            href={`${TODOS_PATH}/new`}
            transitionTypes={FORWARD_TRANSITION}
            className="shrink-0 text-[14px] leading-5 text-accent after:absolute after:inset-0 after:rounded-[16px]"
          >
            <span className="sr-only">하고 싶은 것 </span>추가
          </Link>
        </div>
      ) : (
        <ul className="mt-2 truncate text-[14px] leading-5 text-ink">
          {todos.map((todo) => (
            <li key={todo.id} className="mr-3.5 inline last:mr-0">
              {/* position을 주면 카드를 덮는 링크보다 위로 올라와 그 자리가 눌리지 않는다 */}
              <span aria-hidden="true" className="mr-[7px] mb-0.5 inline-block size-[5px] rounded-full bg-accent align-middle" />
              {todo.content}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

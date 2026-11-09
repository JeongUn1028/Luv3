"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { startTransition, useOptimistic, useState, type ReactElement } from "react";
import { ChevronDownIcon, ChevronUpIcon } from "@/components/icons";
import { refreshOutsideForm } from "@/lib/navigation/refresh-outside-form";
import { FORWARD_TRANSITION } from "@/lib/navigation/transition";
import { createClient } from "@/lib/supabase/client";
import { applyTodoAction, groupTodos, TODOS_PATH, type Todo, type TodoAction } from "@/lib/todos/list";

const SAVE_FAILED_MESSAGE = "저장하지 못했어요. 잠시 후 다시 시도해 주세요.";
const ALREADY_DELETED_MESSAGE = "이미 지워진 항목이에요. 목록을 새로 불러왔어요.";

const MOVE_BUTTON_CLASS_NAME =
  "flex size-11 shrink-0 items-center justify-center text-ink-sub hover:text-ink press-icon aria-disabled:opacity-25 aria-disabled:hover:text-ink-sub";

interface TodoListProps {
  /** 서버에서 읽은 전체 목록(하지 않은 것·완료한 것 모두) */
  todos: Todo[];
}

/** 동작을 DB에 저장한다. 실패하면 화면에 보여 줄 문구를, 성공하면 undefined를 돌려준다 */
const saveTodoAction = async (action: TodoAction): Promise<string | undefined> => {
  const supabase = createClient();
  if (action.type === "move") {
    const { error } = await supabase.rpc("move_todo", { p_id: action.id, p_offset: action.offset });
    // 상대가 지웠거나 완료한 항목(P0002)이면 새로 불러온 목록으로 맞춘다
    if (error) return error.code === "P0002" ? ALREADY_DELETED_MESSAGE : SAVE_FAILED_MESSAGE;
    return undefined;
  }
  // 상대가 지운 항목은 오류 없이 0행이 바뀌므로, 바뀐 행을 받아 확인한다
  const { data, error } = await supabase
    .from("todos")
    .update({ completed_at: action.completedAt ?? null })
    .eq("id", action.id)
    .select("id");
  if (error) return SAVE_FAILED_MESSAGE;
  return data.length === 0 ? ALREADY_DELETED_MESSAGE : undefined;
};

/**
 * 둘이 함께 쓰는 하고 싶은 것 목록. 하지 않은 항목은 정한 순서대로, 완료한 항목은 아래에 따로 그린다.
 * 체크·순서 바꾸기는 저장을 기다리지 않고 화면에 먼저 반영하고, 저장이 끝나면 서버 목록으로 다시 맞춘다.
 * 순서는 위·아래 버튼으로 한 칸씩 바꿔, 화면 읽기 프로그램으로도 같은 방법으로 바꿀 수 있다.
 *
 * @example <TodoList todos={await getTodos()} />
 */
export const TodoList = ({ todos }: TodoListProps): ReactElement => {
  const router = useRouter();
  const [optimisticTodos, addOptimisticAction] = useOptimistic(todos, applyTodoAction);
  const [notice, setNotice] = useState<string>();
  // 순서를 바꾼 결과를 화면 읽기 프로그램에 알려 준다(버튼만 눌러서는 바뀐 자리를 알 수 없다)
  const [announcement, setAnnouncement] = useState("");
  const { open, done } = groupTodos(optimisticTodos);

  const runAction = (action: TodoAction) => {
    setNotice(undefined);
    startTransition(async () => {
      addOptimisticAction(action);
      const failure = await saveTodoAction(action);
      if (failure) {
        setNotice(failure);
        // 옮기지 못했으면 "옮겼어요" 안내가 남지 않게 지운다(실패 문구는 alert로 따로 읽힌다)
        setAnnouncement("");
      }
      // 저장에 실패하면 먼저 바꾼 화면은 저절로 되돌아간다. 세션이 끊겼을 때 다시 불러오면 로그인 화면으로 넘어가 다시 로그인 창이 소용없어진다(#102)
      if (failure === SAVE_FAILED_MESSAGE) return;
      // await 뒤의 갱신은 다시 transition으로 감싸야 새 목록이 올 때까지 먼저 바꾼 화면이 유지된다.
      // 저장하는 동안 누른 폼 링크는 이 transition과 묶여 기다리므로, 폼으로 옮기는 중이면 다시 불러오지 않는다(#164)
      refreshOutsideForm(() => startTransition(() => router.refresh()));
    });
  };

  const handleMove = (todo: Todo, offset: -1 | 1) => {
    const index = open.findIndex(({ id }) => id === todo.id);
    const nextIndex = index + offset;
    // 끝에 있는 버튼은 초점을 잃지 않도록 disabled 대신 aria-disabled로 두고 여기서 막는다
    if (index === -1 || nextIndex < 0 || nextIndex >= open.length) return;
    setAnnouncement(`${todo.content}, ${nextIndex + 1}번째로 옮겼어요`);
    runAction({ type: "move", id: todo.id, offset });
  };

  const handleToggle = (todo: Todo, isCompleted: boolean) => {
    runAction({ type: "complete", id: todo.id, completedAt: isCompleted ? new Date().toISOString() : undefined });
  };

  if (optimisticTodos.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 py-12 text-center">
        <p className="text-[15px] text-ink">함께 하고 싶은 것을 적어 보세요</p>
        <p className="text-[13px] text-ink-sub">오른쪽 위 + 버튼으로 추가할 수 있어요</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 pt-2 pb-6">
      <p role="status" className="sr-only">
        {announcement}
      </p>
      {notice && (
        <p role="alert" className="text-[13px] text-accent">
          {notice}
        </p>
      )}

      {open.length > 0 && (
        <ul aria-label="하고 싶은 것" className="flex flex-col">
          {open.map((todo, index) => (
            <TodoItem key={todo.id} todo={todo} onToggle={handleToggle}>
              <button
                type="button"
                aria-label={`${todo.content} 위로 옮기기`}
                aria-disabled={index === 0}
                onClick={() => handleMove(todo, -1)}
                className={MOVE_BUTTON_CLASS_NAME}
              >
                <ChevronUpIcon className="size-5" />
              </button>
              <button
                type="button"
                aria-label={`${todo.content} 아래로 옮기기`}
                aria-disabled={index === open.length - 1}
                onClick={() => handleMove(todo, 1)}
                className={MOVE_BUTTON_CLASS_NAME}
              >
                <ChevronDownIcon className="size-5" />
              </button>
            </TodoItem>
          ))}
        </ul>
      )}

      {done.length > 0 && (
        <section aria-labelledby="todos-done">
          <h2 id="todos-done" className="text-[13px] text-ink-sub">
            완료 {done.length}
          </h2>
          <ul className="mt-1 flex flex-col">
            {done.map((todo) => (
              <TodoItem key={todo.id} todo={todo} onToggle={handleToggle} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
};

interface TodoItemProps {
  todo: Todo;
  onToggle: (todo: Todo, isCompleted: boolean) => void;
  /** 오른쪽 끝 버튼(순서 바꾸기). 완료한 항목에는 없다 */
  children?: ReactElement[];
}

/** 목록 한 줄: 완료 체크 + 내용(누르면 고치기 화면) + 순서 버튼 */
const TodoItem = ({ todo, onToggle, children }: TodoItemProps): ReactElement => {
  const isCompleted = todo.completedAt !== undefined;
  return (
    <li className="flex min-h-[60px] items-center border-b border-line">
      <label className="flex size-11 shrink-0 cursor-pointer items-center justify-center">
        <input
          type="checkbox"
          checked={isCompleted}
          aria-label={`${todo.content} 완료`}
          onChange={(event) => onToggle(todo, event.target.checked)}
          className="size-5 accent-accent"
        />
      </label>
      <Link
        href={`${TODOS_PATH}/${todo.id}/edit`}
        transitionTypes={FORWARD_TRANSITION}
        className={`min-w-0 flex-1 py-3 pr-2 text-[15px] leading-[1.5] break-words ${isCompleted ? "text-ink-sub line-through" : "text-ink"}`}
      >
        {todo.content}
      </Link>
      {children}
    </li>
  );
};

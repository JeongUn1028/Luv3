"use client";

import { useRouter } from "next/navigation";
import { startTransition, useLayoutEffect, useOptimistic, useRef, useState, useSyncExternalStore, type ReactElement } from "react";
import { toCheckboxId, TodoItem, TodoMoveButtons } from "@/components/todos/TodoItem";
import { DELETING_KEYS, omitDeleting, useDeletingKeys } from "@/lib/deleting";
import { refreshOutsideForm } from "@/lib/navigation/refresh-outside-form";
import { useResetOnHide } from "@/lib/navigation/use-reset-on-hide";
import { createClient } from "@/lib/supabase/client";
import { saveTodoAction, TODO_ACTION_FAILED_MESSAGE } from "@/lib/todos/actions";
import { applyTodoAction, groupTodos, type Todo, type TodoAction } from "@/lib/todos/list";
import { findSettledPendingIds, mergePendingTodos, pendingTodoStore, type PendingTodo, type ShownTodo } from "@/lib/todos/pending";

// 서버에서 그릴 때는 저장 중인 항목이 없다. 같은 값을 돌려줘야 다시 그리지 않는다
const NO_PENDING_TODOS: readonly PendingTodo[] = [];

interface TodoListProps {
  /** 서버에서 읽은 전체 목록(하지 않은 것·완료한 것 모두) */
  todos: Todo[];
}

/** 동작을 DB에 저장한다. 실패하면 화면에 보여 줄 문구를, 성공하면 undefined를 돌려준다 */
const saveAction = async (action: TodoAction): Promise<string | undefined> => {
  const supabase = createClient();
  return saveTodoAction({ action, todos: supabase.from("todos"), moveTodo: (args) => supabase.rpc("move_todo", args) });
};

/**
 * 둘이 함께 쓰는 하고 싶은 것 목록. 하지 않은 항목은 정한 순서대로, 완료한 항목은 아래에 따로 그린다.
 * 체크·순서 바꾸기는 저장을 기다리지 않고 화면에 먼저 반영하고, 저장이 끝나면 서버 목록으로 다시 맞춘다.
 * 순서는 위·아래 버튼으로 한 칸씩 바꿔, 화면 읽기 프로그램으로도 같은 방법으로 바꿀 수 있다.
 * 폼에서 저장 중인 항목(#345)은 서버 목록이 따라잡을 때까지 흐리게 먼저 보여 주고, 아직 서버에 없을 수 있어 누를 수 없게 한다.
 *
 * @example <TodoList todos={await getTodos()} />
 */
export const TodoList = ({ todos }: TodoListProps): ReactElement => {
  const router = useRouter();
  const [optimisticTodos, addOptimisticAction] = useOptimistic(todos, applyTodoAction);
  const pendingTodos = useSyncExternalStore(pendingTodoStore.subscribe, pendingTodoStore.getPending, () => NO_PENDING_TODOS);
  // 지우기를 확인하고 돌아온 항목은 응답을 기다리지 않고 숨긴다(#346)
  const shownTodos = omitDeleting(mergePendingTodos(optimisticTodos, pendingTodos), useDeletingKeys(), DELETING_KEYS.todo);
  // 서버 목록이 따라잡은 항목은 보관함에서 뺀다. 이미 서버 값으로 그리고 있어 화면은 바뀌지 않는다
  useLayoutEffect(() => {
    pendingTodoStore.remove(findSettledPendingIds(todos, pendingTodos));
  }, [todos, pendingTodos]);
  const [notice, setNotice] = useState<string>();
  // 순서를 바꾼 결과를 화면 읽기 프로그램에 알려 준다(버튼만 눌러서는 바뀐 자리를 알 수 없다)
  const [announcement, setAnnouncement] = useState("");
  useResetOnHide(() => {
    setNotice(undefined);
    setAnnouncement("");
    // 저장은 끝났는데 목록에 들어오지 않은 항목(그사이 상대가 지움)이 흐린 채 남지 않게 한다
    pendingTodoStore.removeSaved();
  });
  const { open, done } = groupTodos(shownTodos);
  // 아직 서버에 없는 새 항목은 순서를 바꿀 때 이웃으로 치지 않는다. 고치는 중인 항목은 서버에도 있어 이웃으로 친다
  const movable = open.filter(({ isNew }) => !isNew);
  const movableIndexById = new Map(movable.map(({ id }, index) => [id, index]));
  // 완료를 바꾸면 항목이 다른 목록으로 옮겨 그려져 체크가 새로 만들어지고 초점이 문서 처음으로 빠진다.
  // 저장이 실패해 되돌아갈 때도 같으므로, 저장이 끝나 목록이 정해질 때까지 초점이 빠질 때마다 그 항목의 체크로 돌려준다
  const focusedToggleIdRef = useRef<string>(undefined);
  useLayoutEffect(() => {
    const todoId = focusedToggleIdRef.current;
    if (!todoId) return;
    if (document.activeElement === null || document.activeElement === document.body) document.getElementById(toCheckboxId(todoId))?.focus();
    if (optimisticTodos === todos) focusedToggleIdRef.current = undefined;
  });

  const runAction = (action: TodoAction) => {
    setNotice(undefined);
    startTransition(async () => {
      addOptimisticAction(action);
      const failure = await saveAction(action);
      if (failure) {
        setNotice(failure);
        // 옮기지 못했으면 "옮겼어요" 안내가 남지 않게 지운다(실패 문구는 alert로 따로 읽힌다)
        setAnnouncement("");
      }
      // 저장에 실패하면 먼저 바꾼 화면은 저절로 되돌아간다. 세션이 끊겼을 때 다시 불러오면 로그인 화면으로 넘어가 다시 로그인 창이 소용없어진다(#102)
      if (failure === TODO_ACTION_FAILED_MESSAGE) return;
      // await 뒤의 갱신은 다시 transition으로 감싸야 새 목록이 올 때까지 먼저 바꾼 화면이 유지된다.
      // 저장하는 동안 누른 폼 링크는 이 transition과 묶여 기다리므로, 폼으로 옮기는 중이면 다시 불러오지 않는다(#164)
      refreshOutsideForm(() => startTransition(() => router.refresh()));
    });
  };

  const handleMove = (todo: ShownTodo, offset: -1 | 1) => {
    const index = movableIndexById.get(todo.id) ?? -1;
    const nextIndex = index + offset;
    // 끝에 있는 버튼은 초점을 잃지 않도록 disabled 대신 aria-disabled로 두고 여기서 막는다
    if (todo.isPending || index === -1 || nextIndex < 0 || nextIndex >= movable.length) return;
    setAnnouncement(`${todo.content}, ${nextIndex + 1}번째로 옮겼어요`);
    runAction({ type: "move", id: todo.id, offset });
  };

  const handleToggle = (todo: Todo, isCompleted: boolean) => {
    // 화면을 눌러 초점이 없던 경우(아이폰)는 초점을 만들지 않는다
    focusedToggleIdRef.current = document.activeElement?.id === toCheckboxId(todo.id) ? todo.id : undefined;
    runAction({ type: "complete", id: todo.id, completedAt: isCompleted ? new Date().toISOString() : undefined });
  };

  // 마지막 항목이 상대에게 지워졌다는 안내도 빈 목록과 함께 보여야 하므로, 안내는 목록이 비었는지와 상관없이 그린다
  const messages = (
    <>
      <p role="status" className="sr-only">
        {announcement}
      </p>
      {notice && (
        <p role="alert" className="text-[13px] text-accent">
          {notice}
        </p>
      )}
    </>
  );

  if (shownTodos.length === 0) {
    return (
      // 빈 목록 문구의 자리가 바뀌지 않게, 위 여백은 안내가 있을 때만 둔다
      <div className={notice ? "flex flex-1 flex-col pt-2" : "flex flex-1 flex-col"}>
        {messages}
        <div className="flex flex-1 flex-col items-center justify-center gap-2 py-12 text-center">
          <p className="text-[15px] text-ink">함께 하고 싶은 것을 적어 보세요</p>
          <p className="text-[13px] text-ink-sub">오른쪽 위 + 버튼으로 추가할 수 있어요</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 pt-2 pb-6">
      {messages}

      {open.length > 0 && (
        <ul aria-label="하고 싶은 것" className="flex flex-col">
          {open.map((todo) => {
            const index = todo.isPending ? -1 : (movableIndexById.get(todo.id) ?? -1);
            return (
              <TodoItem key={todo.id} todo={todo} onToggle={handleToggle}>
                <TodoMoveButtons
                  content={todo.content}
                  isFirst={index <= 0}
                  isLast={index === -1 || index === movable.length - 1}
                  onMove={(offset) => handleMove(todo, offset)}
                />
              </TodoItem>
            );
          })}
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

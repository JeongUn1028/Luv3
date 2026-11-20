"use client";

import { useRef, type ReactElement } from "react";
import { FIELD_LABEL_CLASS_NAME } from "@/components/FormField";
import { ModalDialog, PICKER_LIST_CLASS_NAME, PICKER_ROW_CLASS_NAME, type ModalDialogHandle } from "@/components/ModalDialog";
import type { LinkedTodo } from "@/lib/events/form";

interface EventTodoFieldProps {
  /** 지금 이어 둔 하고 싶은 것(고른 순서). 없으면 "하고 싶은 것과 잇기", 있으면 한 줄에 하나씩 보이고 아래에 "하나 더 잇기"를 둔다 */
  linkedTodos: LinkedTodo[];
  /** 고를 수 있는 하고 싶은 것(아직 일정이 없고 완료하지 않은 것, 목록 순서). 이어 둔 것은 빠져 있다 */
  options: LinkedTodo[];
  isDisabled: boolean;
  /** 앞선 저장에서 이었는지 모를 때. 다시 저장해 끝낼 때까지 바꾸지 못하게 하고 이유를 보인다 */
  isLocked: boolean;
  /** 하나 더 고르거나 하나를 끊으면 바뀐 목록으로 부른다. 저장할 때 반영한다 */
  onChange: (todos: LinkedTodo[]) => void;
}

const BUTTON_CLASS_NAME = "press-card flex h-12 items-center justify-center rounded-[10px] border border-line text-[15px] disabled:opacity-50";

/**
 * 일정 폼의 "하고 싶은 것" 칸(#472). 일정 하나에 여러 개를 이을 수 있다(#495). 고르는 창은 기록 상세의 "일정과 잇기" 창과 같은 모양이고, 하나 고르면 닫힌다.
 * 고르거나 끊어도 바로 저장하지 않고, 폼을 저장할 때 반영한다(폼의 다른 칸과 같다).
 *
 * @example <EventTodoField linkedTodos={draft.linkedTodos ?? []} options={linkableTodos} isDisabled={isSaving} isLocked={false} onChange={handleTodosChange} />
 */
export const EventTodoField = ({ linkedTodos, options, isDisabled: isBusy, isLocked, onChange }: EventTodoFieldProps): ReactElement => {
  const modalRef = useRef<ModalDialogHandle>(null);
  const isDisabled = isBusy || isLocked;

  const handlePick = (todo: LinkedTodo) => {
    onChange([...linkedTodos, todo]);
    modalRef.current?.close();
  };

  return (
    <div className="flex flex-col gap-2">
      <span id="event-todo-label" className={FIELD_LABEL_CLASS_NAME}>
        하고 싶은 것
      </span>
      {linkedTodos.length > 0 && (
        <ul aria-labelledby="event-todo-label" className="flex flex-col gap-2">
          {linkedTodos.map((todo) => (
            <li key={todo.id} className="flex min-h-12 items-center gap-2 rounded-[10px] border border-line pl-4">
              <span className="min-w-0 flex-1 truncate py-3 text-[15px] text-ink">{todo.content}</span>
              <button
                type="button"
                disabled={isDisabled}
                aria-label={`${todo.content} 연결 끊기`}
                onClick={() => onChange(linkedTodos.filter(({ id }) => id !== todo.id))}
                className="press-icon h-12 shrink-0 px-4 text-[13px] text-ink-sub hover:text-ink disabled:opacity-50"
              >
                연결 끊기
              </button>
            </li>
          ))}
        </ul>
      )}
      {/* 더 고를 것이 없으면 두지 않는다. 처음 하나는 "잇기", 그다음부터는 "하나 더 잇기"다 */}
      {options.length > 0 && (
        <button
          type="button"
          disabled={isDisabled}
          aria-describedby="event-todo-label"
          onClick={() => modalRef.current?.open()}
          className={`${BUTTON_CLASS_NAME} text-ink-sub hover:text-ink`}
        >
          {linkedTodos.length > 0 ? "하나 더 잇기" : "하고 싶은 것과 잇기"}
        </button>
      )}
      {isLocked && (
        <p id="event-todo-locked" className={FIELD_LABEL_CLASS_NAME}>
          저장을 마친 뒤에 바꿀 수 있어요.
        </p>
      )}
      <ModalDialog ref={modalRef} title="어느 하고 싶은 것과 이을까요?" description="이으면 하고 싶은 것 목록의 그 줄에 날짜가 붙어요." shouldCloseOnOutsideClick shouldGuardDoubleTap isPicker>
        <ul aria-label="이을 하고 싶은 것" className={PICKER_LIST_CLASS_NAME}>
          {options.map((todo) => (
            <li key={todo.id}>
              <button type="button" onClick={() => handlePick(todo)} className={`${PICKER_ROW_CLASS_NAME} min-h-[52px] items-center text-[15px] break-words text-ink`}>
                {todo.content}
              </button>
            </li>
          ))}
        </ul>
        <div className="mt-5 flex">
          <button
            type="button"
            onClick={() => modalRef.current?.close()}
            className="press-wide h-12 flex-1 rounded-[10px] border border-line text-[15px] text-ink hover:bg-background"
          >
            취소
          </button>
        </div>
      </ModalDialog>
    </div>
  );
};

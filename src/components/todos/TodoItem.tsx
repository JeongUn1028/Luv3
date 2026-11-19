"use client";

import Link from "next/link";
import type { MouseEvent, ReactElement } from "react";
import { ChevronDownIcon, ChevronUpIcon } from "@/components/icons";
import { SETTLE_TRANSITION_CLASS_NAME } from "@/components/settle-transition";
import { FORWARD_TRANSITION } from "@/lib/navigation/transition";
import { formatTodoEventChip, getTodoEventLastDay, shouldAskTodoEventDone } from "@/lib/todos/event-chip";
import type { Todo } from "@/lib/todos/list";
import type { ShownTodo } from "@/lib/todos/pending";
import { toTodoEditHref } from "@/lib/todos/schedule";
import type { StrikePhase } from "@/components/todos/use-todo-motion";

/**
 * 항목의 완료 체크 id. 다른 목록으로 옮겨 그린 뒤 초점을 돌려줄 때 찾는다.
 *
 * @example document.getElementById(toCheckboxId(todo.id))?.focus();
 */
export const toCheckboxId = (todoId: string): string => `todo-${todoId}-done`;

// 저장 중인 항목이 저장을 마치면 흐린 모양에서 원래 모양으로 부드럽게 바뀐다(#345). 자리는 그대로라 움직이지 않는다
const MOVE_BUTTON_CLASS_NAME = `flex size-11 shrink-0 items-center justify-center text-ink-sub hover:text-ink press-icon aria-disabled:opacity-25 aria-disabled:hover:text-ink-sub ${SETTLE_TRANSITION_CLASS_NAME}`;

interface TodoMoveButtonsProps {
  content: string;
  /** 끝에 있는 버튼은 초점을 잃지 않도록 disabled 대신 aria-disabled로 두고, 누르면 `onMove`에서 막는다 */
  isFirst: boolean;
  isLast: boolean;
  onMove: (offset: -1 | 1) => void;
}

/**
 * 하지 않은 항목의 오른쪽 끝 위·아래 버튼. 한 칸씩 옮겨 화면 읽기 프로그램으로도 같은 방법으로 바꿀 수 있다.
 *
 * @example <TodoMoveButtons content="바다 보기" isFirst={false} isLast onMove={(offset) => handleMove(todo, offset)} />
 */
export const TodoMoveButtons = ({ content, isFirst, isLast, onMove }: TodoMoveButtonsProps): ReactElement => (
  <>
    <button type="button" aria-label={`${content} 위로 옮기기`} aria-disabled={isFirst} onClick={() => onMove(-1)} className={MOVE_BUTTON_CLASS_NAME}>
      <ChevronUpIcon className="size-5" />
    </button>
    <button type="button" aria-label={`${content} 아래로 옮기기`} aria-disabled={isLast} onClick={() => onMove(1)} className={MOVE_BUTTON_CLASS_NAME}>
      <ChevronDownIcon className="size-5" />
    </button>
  </>
);

interface TodoItemProps {
  todo: ShownTodo;
  onToggle: (todo: Todo, isCompleted: boolean) => void;
  /** 폼에서 막 더한 항목이면 잠깐 표시한다(#347) */
  isJustAdded?: boolean;
  /** 완료를 눌러 제자리에서 줄을 긋는 중이면 그 단계. 체크된 채로 그린다(#347) */
  strikePhase?: StrikePhase | undefined;
  /** 방금 완료 칸으로 옮겨 나타나는 중인지 */
  isArriving?: boolean;
  /** 오늘(한국 날짜). 주면 하지 않은 항목에 이어진 일정 칩을 붙인다(#471) */
  today?: string | undefined;
  /** 주면 이어진 일정이 지났을 때 줄 아래에 "다녀오셨나요?"를 묻는다(#471). 일정의 마지막 날을 함께 넘긴다 */
  onAnswerAsk?: ((todo: Todo, answer: TodoAskAnswer) => void) | undefined;
  /** 오른쪽 끝 버튼(순서 바꾸기). 완료한 항목에는 없다 */
  children?: ReactElement;
}

const toMotionClassName = ({ isJustAdded, strikePhase, isArriving }: Pick<TodoItemProps, "isJustAdded" | "strikePhase" | "isArriving">): string => {
  if (strikePhase === "leaving") return "todo-leave";
  if (isArriving) return "todo-arrive";
  return isJustAdded ? "todo-just-added" : "";
};

/** 지난 일정 묻기의 대답. [아직]은 누를 때 본 일정의 마지막 날을 기억한다 */
export type TodoAskAnswer = { type: "done" } | { type: "notYet"; eventId: string; lastDay: string };

const ASK_BUTTON_CLASS_NAME = `press-wide h-10 flex-1 rounded-[10px] text-[13px] ${SETTLE_TRANSITION_CLASS_NAME}`;

interface TodoDoneAskProps {
  todo: Todo;
  eventId: string;
  lastDay: string;
  onAnswer: (todo: Todo, answer: TodoAskAnswer) => void;
}

/** 이어진 일정 날짜가 지난 줄 아래의 묻는 칸(#471). 두 사람이 같이 보는 목록이라 [아직]도 DB에 저장한다 */
const TodoDoneAsk = ({ todo, eventId, lastDay, onAnswer }: TodoDoneAskProps): ReactElement => {
  const questionId = `todo-${todo.id}-ask`;
  return (
    <div role="group" aria-labelledby={questionId} className="mb-2.5 flex w-full flex-col gap-2 rounded-xl border border-line bg-surface px-3 py-2.5">
      <p id={questionId} className="text-[13px] leading-[1.5] text-ink">
        {/* 버튼만 따로 읽어도 어느 항목을 묻는지 알 수 있게 내용을 앞에 붙인다 */}
        <span className="sr-only">{todo.content}, </span>
        다녀오셨나요? 완료로 옮길까요?
      </p>
      <div className="flex gap-2">
        <button type="button" onClick={() => onAnswer(todo, { type: "done" })} className={`${ASK_BUTTON_CLASS_NAME} bg-accent font-display text-background`}>
          완료
        </button>
        <button type="button" onClick={() => onAnswer(todo, { type: "notYet", eventId, lastDay })} className={`${ASK_BUTTON_CLASS_NAME} border border-line text-ink`}>
          아직
        </button>
      </div>
    </div>
  );
};

/** 저장 중인 항목은 고치기 화면을 열지 않는다. 새 항목은 아직 서버에 없어 찾을 수 없다고 나온다 */
const preventOpening = (event: MouseEvent<HTMLAnchorElement>) => event.preventDefault();

/**
 * 목록 한 줄: 완료 체크 + 내용(누르면 고치기 화면, 이어진 일정이 있으면 날짜 칩) + 순서 버튼. 저장 중이면 흐리게 그리고 누를 수 없게 한다.
 * 이어진 일정이 지났으면 줄 아래에 완료로 옮길지 묻는 칸을 붙인다(#471).
 * 움직임(막 더함 표시·줄긋기·나타남)은 `globals.css`의 `todo-*` 클래스다.
 *
 * @example <TodoItem todo={todo} onToggle={handleToggle} />
 */
export const TodoItem = ({ todo, onToggle, isJustAdded = false, strikePhase, isArriving = false, today, onAnswerAsk, children }: TodoItemProps): ReactElement => {
  const isCompleted = todo.completedAt !== undefined;
  const isStriking = strikePhase !== undefined;
  const eventChip = todo.event && today && !isCompleted ? formatTodoEventChip(todo.event, today) : undefined;
  const { isPending } = todo;
  // 줄을 긋는 중이거나 저장 중인 항목에는 묻지 않는다. 완료로 옮기는 중에 다시 누를 수 없게 한다
  const askEvent = todo.event && today && onAnswerAsk && !isCompleted && !isStriking && !isPending && shouldAskTodoEventDone(todo.event, today) ? todo.event : undefined;
  const textColorClassName = isCompleted || isPending || isStriking ? "text-ink-sub" : "text-ink";
  return (
    <li
      data-just-added={isJustAdded || undefined}
      // 묻는 칸은 줄을 꽉 채워 다음 줄로 내려간다
      className={`flex min-h-[60px] flex-wrap items-center border-b border-line ${toMotionClassName({ isJustAdded, strikePhase, isArriving })}`}
    >
      <label className="flex size-11 shrink-0 cursor-pointer items-center justify-center">
        <input
          id={toCheckboxId(todo.id)}
          type="checkbox"
          checked={isCompleted || isStriking}
          disabled={isPending}
          aria-label={`${todo.content} 완료`}
          onChange={(event) => onToggle(todo, event.target.checked)}
          className={`size-5 accent-accent disabled:opacity-35 ${SETTLE_TRANSITION_CLASS_NAME}`}
        />
      </label>
      <Link
        href={toTodoEditHref(todo.id)}
        transitionTypes={FORWARD_TRANSITION}
        aria-disabled={isPending}
        onClick={isPending ? preventOpening : undefined}
        className={`min-w-0 flex-1 py-3 pr-2 text-[15px] leading-[1.5] break-words ${textColorClassName} ${isCompleted ? "line-through" : ""} ${SETTLE_TRANSITION_CLASS_NAME}`}
      >
        {isStriking ? <span className="todo-strike">{todo.content}</span> : todo.content}
        {isPending && <span className="sr-only"> (저장 중)</span>}
        {eventChip && (
          <span className={`mt-1 block w-fit rounded-full px-2.5 py-0.5 text-[12px] ${eventChip.isPast ? "bg-cream/10 text-cream" : "bg-accent/10 text-accent"}`}>
            {/* 화면 읽기 프로그램이 내용과 붙여 읽지 않게 띄운다 */}
            <span className="sr-only">, 일정 </span>
            {eventChip.label}
          </span>
        )}
      </Link>
      {children}
      {askEvent && onAnswerAsk && <TodoDoneAsk todo={todo} eventId={askEvent.id} lastDay={getTodoEventLastDay(askEvent)} onAnswer={onAnswerAsk} />}
    </li>
  );
};

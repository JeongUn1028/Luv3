"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, type MouseEvent, type ReactElement } from "react";
import { FIELD_LABEL_CLASS_NAME } from "@/components/FormField";
import { CalendarIcon } from "@/components/icons";
import { ModalActions } from "@/components/ModalActions";
import { ModalDialog, type ModalDialogHandle } from "@/components/ModalDialog";
import { toCalendarHref } from "@/lib/calendar/month";
import { toScheduleTodoHref } from "@/lib/todos/schedule";
import { FORWARD_TRANSITION } from "@/lib/navigation/transition";
import { formatTodoEventChip } from "@/lib/todos/event-chip";
import type { TodoEvent } from "@/lib/todos/list";

interface TodoEventFieldProps {
  todoId: string;
  /** 이어진 일정. 없으면 "일정 잡기"를 보인다 */
  event: TodoEvent | undefined;
  /** 오늘(한국 날짜). 일정 날짜가 지났는지 본다 */
  today: string;
  /** 고치던 내용이 있으면 true. 떠나기 전에 버리고 나갈지 묻는다 */
  shouldConfirmLeave: boolean;
}

// 새 탭·새 창으로 여는 누름은 브라우저에 맡긴다
const isPlainClick = ({ button, metaKey, ctrlKey, shiftKey, altKey }: MouseEvent): boolean =>
  button === 0 && !metaKey && !ctrlKey && !shiftKey && !altKey;

const ACTION_CLASS_NAME = "press-card flex h-12 items-center justify-center gap-2 rounded-[10px] border border-line text-[15px] text-ink";

/**
 * 하고 싶은 것 고치기 화면의 "일정" 칸(#471). 이어진 일정이 없으면 "일정 잡기"로 새 일정 폼을 열고,
 * 있으면 날짜 칩과 "일정 보기"로 캘린더의 그날을 연다. 고치던 내용이 있으면 떠나기 전에 묻는다.
 *
 * @example <TodoEventField todoId={todo.id} event={todo.event} today="2026-11-19" shouldConfirmLeave={false} />
 */
export const TodoEventField = ({ todoId, event, today, shouldConfirmLeave }: TodoEventFieldProps): ReactElement => {
  const router = useRouter();
  const modalRef = useRef<ModalDialogHandle>(null);
  const href = event ? toCalendarHref({ date: event.date }) : toScheduleTodoHref(todoId);
  const chip = event && formatTodoEventChip(event, today);

  const handleClick = (clickEvent: MouseEvent<HTMLAnchorElement>) => {
    if (!shouldConfirmLeave || !isPlainClick(clickEvent)) return;
    clickEvent.preventDefault();
    modalRef.current?.open();
  };

  const handleConfirmLeave = () => {
    // 창을 띄운 채 화면이 숨겨지면 앱을 막으므로, 옮기기 전에 바로 닫는다(#155)
    modalRef.current?.closeImmediately();
    router.push(href, { transitionTypes: FORWARD_TRANSITION });
  };

  return (
    <div className="flex flex-col gap-2">
      <span id="todo-event-label" className={FIELD_LABEL_CLASS_NAME}>
        일정
      </span>
      <div role="group" aria-labelledby="todo-event-label" className="flex items-center gap-3">
        {chip && (
          <span className={`rounded-full px-2.5 py-1 text-[13px] ${chip.isPast ? "bg-cream/10 text-cream" : "bg-accent/10 text-accent"}`}>
            {chip.label}
          </span>
        )}
        <Link href={href} transitionTypes={FORWARD_TRANSITION} onClick={handleClick} className={`${ACTION_CLASS_NAME} ${event ? "ml-auto px-4" : "w-full"}`}>
          {!event && <CalendarIcon className="size-5 text-accent" />}
          {event ? "일정 보기" : "일정 잡기"}
        </Link>
      </div>
      {shouldConfirmLeave && (
        <ModalDialog ref={modalRef} title="쓰던 내용을 버리고 나갈까요?" description="저장하지 않은 내용은 사라져요.">
          <ModalActions cancelLabel="계속 쓰기" onCancel={() => modalRef.current?.close()} confirmLabel="나가기" onConfirm={handleConfirmLeave} />
        </ModalDialog>
      )}
    </div>
  );
};

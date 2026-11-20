import type { ReactElement } from "react";
import { SETTLE_TRANSITION_CLASS_NAME } from "@/components/settle-transition";
import type { ShownTodo } from "@/lib/todos/pending";

interface TodoPickItemProps {
  todo: ShownTodo;
  isPicked: boolean;
  /** 저장 중인 새 항목(아직 서버에 없다)이나 완료로 옮겨 가는 중인 항목이면 고를 수 없다 */
  isDisabled: boolean;
  onChange: (todo: ShownTodo, isPicked: boolean) => void;
}

/**
 * 일정 잡을 것을 고르는 동안의 '아직' 구역 한 줄(#495). 줄 어디를 눌러도 고르고, 완료 체크(네모)와 헷갈리지 않게 동그라미로 그린다.
 * 고를 수 없는 항목은 흐리게 둔다.
 *
 * @example <TodoPickItem todo={todo} isPicked={false} isDisabled={false} onChange={handlePick} />
 */
export const TodoPickItem = ({ todo, isPicked, isDisabled, onChange }: TodoPickItemProps): ReactElement => {
  return (
    <li className="border-b border-line">
      <label className={`flex min-h-[60px] items-center ${isDisabled ? "opacity-40" : "cursor-pointer"} ${SETTLE_TRANSITION_CLASS_NAME}`}>
        <span className="relative flex size-11 shrink-0 items-center justify-center">
          <input
            type="checkbox"
            checked={isPicked}
            disabled={isDisabled}
            aria-label={`${todo.content} 고르기`}
            onChange={(event) => onChange(todo, event.target.checked)}
            className="peer absolute inset-0 m-0 size-full cursor-pointer appearance-none opacity-0 disabled:cursor-default"
          />
          {/* 투명한 칸을 44px 자리 전체에 덮어 누르기 쉽게 하고, 고르면 이 동그라미를 분홍으로 채워 체크를 그린다. 키보드 초점도 동그라미에 보인다 */}
          <span
            aria-hidden="true"
            className="flex size-[22px] items-center justify-center rounded-full border-[1.5px] border-ink-sub text-background peer-checked:border-accent peer-checked:bg-accent peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent"
          >
            {isPicked && (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" className="size-3.5" focusable="false">
                <path d="M5 12.5l4.5 4.5L19 7.5" />
              </svg>
            )}
          </span>
        </span>
        <span className="min-w-0 flex-1 py-3 pr-2 text-[15px] leading-[1.5] break-words text-ink">
          {todo.content}
          {todo.isPending && <span className="sr-only"> (저장 중)</span>}
        </span>
      </label>
    </li>
  );
};

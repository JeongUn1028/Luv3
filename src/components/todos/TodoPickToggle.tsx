"use client";

import { useState, useSyncExternalStore, type ReactElement } from "react";
import { canPickTodos, todoListMode } from "@/lib/todos/list-mode";

/**
 * 하고 싶은 것 탭 머리글의 '일정 잡기 / 취소'(#495). 누르면 목록이 일정 잡을 것을 고르는 상태가 된다.
 * 목록의 네모 칸은 완료 체크라 고르기는 따로 들어간다. 순서 바꾸기 편집 중이거나 고를 것('아직' 구역)이 없으면 막는다.
 * 눌렀을 때 초점을 잃지 않게 disabled 대신 aria-disabled로 두고 여기서 막는다.
 *
 * @example <TabScreen actions={<><TodoPickToggle /><TodoAddLink /></>} />
 */
export const TodoPickToggle = (): ReactElement => {
  // 서버에서 그린 화면은 고르는 중일 수 없고, 목록을 받기 전이라 고를 것도 모른다
  const mode = useSyncExternalStore(todoListMode.subscribe, todoListMode.get, () => "view");
  const canPick = useSyncExternalStore(canPickTodos.subscribe, canPickTodos.get, () => false);
  // 글자만 바뀌어 화면 읽기 프로그램은 무엇이 달라졌는지 알 수 없다(띠는 화면에만 보인다)
  const [announcement, setAnnouncement] = useState("");
  const isPicking = mode === "pick";
  const isBlocked = !isPicking && (mode === "reorder" || !canPick);

  const handleClick = () => {
    if (isBlocked) return;
    setAnnouncement(isPicking ? "일정 잡기를 그만뒀어요" : "일정을 잡을 하고 싶은 것을 골라 주세요. 다 고르면 목록 아래 버튼을 눌러 주세요");
    todoListMode.set(isPicking ? "view" : "pick");
  };

  return (
    <>
      <button type="button" aria-disabled={isBlocked} onClick={handleClick} className="press-icon flex h-11 shrink-0 items-center px-1 text-[13px] aria-disabled:opacity-30">
        <span className={`rounded-full border px-3 py-1 ${isPicking ? "border-accent text-accent" : "border-line text-ink"}`}>{isPicking ? "취소" : "일정 잡기"}</span>
      </button>
      <span role="status" className="sr-only">
        {announcement}
      </span>
    </>
  );
};

"use client";

import { useOffline } from "next/offline";
import { useId, type MouseEvent, type ReactElement, type ReactNode } from "react";
import { SAVE_BUTTON_CLASS_NAME } from "@/components/save-button-style";

interface SaveButtonProps {
  /** 지금은 누를 수 없는지(저장 중, 사진 정보를 읽는 중) */
  isDisabled: boolean;
  /** 버튼 글자("저장", "저장 중…") */
  children: ReactNode;
}

/**
 * 폼의 저장 버튼. 인터넷이 끊겼으면 보내지 않고 막아 두고 까닭을 알린다(#349).
 * 보내 보고 실패하면 끊긴 것을 알면서도 "저장됐는지 확인하지 못했어요"라고 해야 해서, 조회 실패 화면의 "다시 시도"(#139)처럼 미리 막는다.
 * 쓰던 칸에서 엔터를 쳐도 폼은 이 버튼을 누른 것으로 처리하므로, 누름을 취소하면 엔터로도 보내지 않는다.
 * `disabled`는 누른 순간 초점을 빼앗아 키보드·화면 읽기 프로그램 사용자가 자리를 잃으므로 끊김은 `aria-disabled`로 막는다.
 *
 * @example <SaveButton isDisabled={isSaving}>{isSaving ? "저장 중…" : "저장"}</SaveButton>
 */
export const SaveButton = ({ isDisabled, children }: SaveButtonProps): ReactElement => {
  const isOffline = useOffline();
  const hintId = useId();
  // 저장 중에 끊기면 그 저장의 결과는 폼이 알리므로, 다시 누르라는 안내는 보여 주지 않는다
  const isBlocked = isOffline && !isDisabled;
  const blockWhileOffline = (event: MouseEvent<HTMLButtonElement>) => {
    if (isBlocked) event.preventDefault();
  };

  return (
    <>
      <button
        type="submit"
        disabled={isDisabled}
        aria-disabled={isBlocked || undefined}
        aria-describedby={isBlocked ? hintId : undefined}
        onClick={blockWhileOffline}
        className={`press-wide ${SAVE_BUTTON_CLASS_NAME} bg-accent disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50`}
      >
        {children}
      </button>
      {isBlocked && (
        <p id={hintId} className="mt-2 text-center text-[12px] text-ink-sub">
          연결되면 저장할 수 있어요
        </p>
      )}
    </>
  );
};

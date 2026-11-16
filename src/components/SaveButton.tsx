"use client";

import type { MouseEvent, ReactElement, ReactNode } from "react";
import { OfflineHint } from "@/components/OfflineHint";
import { SAVE_BUTTON_CLASS_NAME } from "@/components/save-button-style";
import { useOfflineBlock } from "@/lib/use-offline-block";

interface SaveButtonProps {
  /** 지금은 누를 수 없는지(저장 중, 사진 정보를 읽는 중) */
  isDisabled: boolean;
  /** 버튼 글자("저장", "저장 중…") */
  children: ReactNode;
  /** 끊겨서 막았을 때 버튼 아래 알릴 문구. 저장이 아닌 폼(비밀번호 바꾸기)만 바꾼다 */
  offlineHint?: string;
}

/**
 * 폼의 저장 버튼. 인터넷이 끊겼으면 보내지 않고 막아 두고 까닭을 알린다(#349).
 * 보내 보고 실패하면 끊긴 것을 알면서도 "저장됐는지 확인하지 못했어요"라고 해야 해서, 조회 실패 화면의 "다시 시도"(#139)처럼 미리 막는다.
 * 쓰던 칸에서 엔터를 쳐도 폼은 이 버튼을 누른 것으로 처리하므로, 누름을 취소하면 엔터로도 보내지 않는다.
 * 끊김을 막는 규칙은 `useOfflineBlock`을 따른다.
 *
 * @example <SaveButton isDisabled={isSaving}>{isSaving ? "저장 중…" : "저장"}</SaveButton>
 */
export const SaveButton = ({ isDisabled, children, offlineHint = "연결되면 저장할 수 있어요" }: SaveButtonProps): ReactElement => {
  // 저장 중에 끊기면 그 저장의 결과는 폼이 알리므로, 다시 누르라는 안내는 보여 주지 않는다
  const { isBlocked, hintId } = useOfflineBlock(isDisabled);
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
      <OfflineHint id={hintId} isShown={isBlocked} className="mt-2">
        {offlineHint}
      </OfflineHint>
    </>
  );
};

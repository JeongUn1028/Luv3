import { useOffline } from "next/offline";
import { useId } from "react";

interface OfflineBlock {
  /** 끊겨서 버튼을 막고 까닭을 알려야 하는지. 이미 하던 일(저장 중, 다시 시도 중)이 있으면 그 결과가 알리므로 false다 */
  isBlocked: boolean;
  /** 까닭 문구(`OfflineHint`)의 id. 버튼의 `aria-describedby`로 잇는다 */
  hintId: string;
}

/**
 * 인터넷이 끊긴 동안 보내는 버튼(저장, 남기기, 다시 시도)을 막을지 정한다(#139·#349).
 * 보내 보면 끊긴 것을 알면서도 "저장됐는지 확인하지 못했어요"라고 하게 되거나, 연결될 때까지 기다리며 다른 링크까지 묶이므로 미리 막는다.
 * 버튼은 `disabled` 대신 `aria-disabled`로 막는다(`disabled`는 누른 순간 초점을 빼앗아 키보드·화면 읽기 프로그램 사용자가 자리를 잃는다).
 *
 * @example
 * const { isBlocked, hintId } = useOfflineBlock(isSaving);
 * <button aria-disabled={isBlocked || undefined} aria-describedby={isBlocked ? hintId : undefined} />
 * <OfflineHint id={hintId} isShown={isBlocked}>연결되면 저장할 수 있어요</OfflineHint>
 */
export const useOfflineBlock = (isBusy: boolean): OfflineBlock => {
  const isOffline = useOffline();
  const hintId = useId();
  return { isBlocked: isOffline && !isBusy, hintId };
};

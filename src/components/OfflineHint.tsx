import type { ReactElement, ReactNode } from "react";

interface OfflineHintProps {
  /** `useOfflineBlock`의 `hintId` */
  id: string;
  /** `useOfflineBlock`의 `isBlocked` */
  isShown: boolean;
  /** 버튼 위와의 간격 클래스(`mt-2`). 정렬은 `align`으로 정한다 */
  className?: string;
  /** 버튼 아래 어디에 둘지. 너비를 다 쓰는 버튼은 가운데, 줄 끝의 작은 버튼은 오른쪽 */
  align?: "center" | "right";
  /** "연결되면 저장할 수 있어요"처럼 연결되면 무엇을 할 수 있는지 */
  children: ReactNode;
}

/**
 * 끊겨서 막은 버튼 아래에 까닭을 알리는 문구. 버튼은 `aria-describedby`로 이 문구를 잇는다.
 *
 * @example <OfflineHint id={hintId} isShown={isBlocked} className="mt-2">연결되면 저장할 수 있어요</OfflineHint>
 */
export const OfflineHint = ({ id, isShown, className, align = "center", children }: OfflineHintProps): ReactElement | null =>
  isShown ? (
    // 정렬 클래스가 둘 붙으면 어느 쪽이 이길지 CSS 순서에 달려 있어 하나만 붙인다
    <p id={id} className={[align === "right" ? "text-right" : "text-center", "text-[12px] text-ink-sub", className].filter(Boolean).join(" ")}>
      {children}
    </p>
  ) : null;

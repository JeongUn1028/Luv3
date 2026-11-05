"use client";

import { useOffline } from "next/offline";
import type { ReactElement } from "react";

/**
 * 인터넷이 끊기면 화면 맨 위에 띄우는 안내. 어느 화면에서든 보이도록 루트 레이아웃의 화면 틀 맨 위에 둔다.
 * 화면 리더가 나타난 문구를 읽도록 알림 영역은 늘 그려 두고 문구만 넣고 뺀다.
 * 안내가 떠 있는지는 `data-offline-notice`로 CSS에 알려, 머리글과 위쪽 알림의 자리를 맞춘다(`globals.css`).
 *
 * @example <OfflineNotice />
 */
export const OfflineNotice = (): ReactElement => {
  const isOffline = useOffline();

  return (
    <div role="status" className="shrink-0">
      {isOffline && (
        // relative z-10: 머리글보다 4px 큰 홈 로고가 안내를 덮지 않게 위에 놓는다
        <div data-offline-notice className="relative z-10 border-b border-line bg-surface pt-[env(safe-area-inset-top)]">
          <p className="flex h-[var(--offline-notice-line)] items-center justify-center text-[13px] text-ink">
            인터넷이 끊겼어요. 다시 연결되면 이어서 할 수 있어요
          </p>
        </div>
      )}
    </div>
  );
};

"use client";

import { useState, useSyncExternalStore, type ReactElement } from "react";
import { INSTALL_HINT_DISMISSED_KEY, isStandaloneDisplay, shouldShowInstallHint } from "@/lib/pwa/install";

// 사생활 보호 모드 등에서는 저장소 접근이 막혀 예외가 난다. 그때는 닫은 적 없는 것으로 보고 안내를 띄운다
const readDismissed = (): boolean => {
  try {
    return window.localStorage.getItem(INSTALL_HINT_DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
};

const saveDismissed = () => {
  try {
    window.localStorage.setItem(INSTALL_HINT_DISMISSED_KEY, "1");
  } catch {
    // 저장하지 못하면 다음 방문에 다시 보일 뿐이라 화면에서 닫는 것으로 충분하다
  }
};

// 사용자 에이전트·표시 모드·저장소는 브라우저에만 있어, 서버와 첫 하이드레이션에서는 숨기고 그 뒤에 읽는다
const subscribe = () => () => {};
const getSnapshot = (): boolean =>
  shouldShowInstallHint({
    userAgent: window.navigator.userAgent,
    maxTouchPoints: window.navigator.maxTouchPoints,
    isStandalone: isStandaloneDisplay(),
    isDismissed: readDismissed(),
  });
const getServerSnapshot = (): boolean => false;

/**
 * 아이폰 Safari에서 "공유 → 홈 화면에 추가"를 알려 주는 안내. 닫으면 다시 띄우지 않는다.
 * 브라우저 정보를 읽은 뒤에 나타나므로, 화면을 밀어내지 않게 위에 겹쳐 띄운다.
 */
export const InstallHint = (): ReactElement | null => {
  const isEligible = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [isClosed, setIsClosed] = useState(false);
  if (!isEligible || isClosed) return null;

  const handleClose = () => {
    saveDismissed();
    setIsClosed(true);
  };

  return (
    <aside
      aria-label="홈 화면에 추가 안내"
      className="fixed inset-x-0 top-[calc(var(--overlay-top)+16px)] z-10 mx-auto flex w-[calc(100%-48px)] max-w-[382px] items-start gap-3 rounded-[10px] border border-line bg-surface py-3 pr-1 pl-4"
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1 py-0.5">
        <p className="text-[14px] text-ink">홈 화면에 추가하면 앱처럼 열 수 있어요</p>
        <p className="text-[12px] leading-[1.6] text-ink-sub">
          브라우저의 공유 버튼을 누르고 &lsquo;홈 화면에 추가&rsquo;를 고르세요. 처음 열 때 한 번 다시 로그인해요.
        </p>
      </div>
      <button
        type="button"
        onClick={handleClose}
        className="press-icon h-11 shrink-0 px-3 text-[13px] text-ink-sub hover:text-ink"
      >
        닫기
      </button>
    </aside>
  );
};

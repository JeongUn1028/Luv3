"use client";

import { useLayoutEffect, useRef, type ReactElement, type ReactNode } from "react";
import { createScrollRestorer, registerScrollToTop } from "@/lib/navigation/scroll-memory";

interface ScrollAreaProps {
  /** 위치를 기억할 화면 이름. 없으면 화면을 열 때마다 맨 위에서 시작한다 */
  scrollKey?: string;
  className: string;
  children: ReactNode;
}

/**
 * 화면 틀의 내용 스크롤 영역. 브라우저는 문서 스크롤만 되살리고, 링크로 다시 연 화면은 새로 그려져서 안쪽 위치를 직접 기억한다.
 * 숨겨 둔 화면(Activity)을 다시 보여 줄 때도 layout effect가 다시 돌아 위치를 맞춘다.
 *
 * @example <ScrollArea scrollKey="records" className="overflow-y-auto">…</ScrollArea>
 */
export const ScrollArea = ({ scrollKey, className, children }: ScrollAreaProps): ReactElement => {
  const ref = useRef<HTMLDivElement>(null);

  // 화면이 보이기 전에 맞춰야 전환의 새 화면도 그 위치로 찍힌다
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (!scrollKey) {
      element.scrollTop = 0;
      return;
    }

    const restorer = createScrollRestorer(element, scrollKey);
    const observer = new MutationObserver(restorer.retry);
    observer.observe(element, { childList: true, subtree: true });
    element.addEventListener("scroll", restorer.handleScroll, { passive: true });
    element.addEventListener("touchstart", restorer.cancel, { passive: true });
    element.addEventListener("wheel", restorer.cancel, { passive: true });
    const unregisterScrollToTop = registerScrollToTop(scrollKey, () => {
      // 아직 되돌리는 중이면 내용이 늘어날 때 다시 내려가므로 먼저 멈춘다
      restorer.cancel();
      const isMotionReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      element.scrollTo({ top: 0, behavior: isMotionReduced ? "auto" : "smooth" });
    });

    return () => {
      unregisterScrollToTop();
      observer.disconnect();
      element.removeEventListener("scroll", restorer.handleScroll);
      element.removeEventListener("touchstart", restorer.cancel);
      element.removeEventListener("wheel", restorer.cancel);
    };
  }, [scrollKey]);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
};

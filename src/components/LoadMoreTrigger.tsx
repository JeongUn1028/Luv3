"use client";

import { useEffect, useEffectEvent, useRef, type ReactElement } from "react";
import { findScrollParent } from "@/lib/scroll-parent";

interface LoadMoreTriggerProps {
  /** 더 받을 것이 있는지 */
  hasMore: boolean;
  isLoading: boolean;
  /** 앞 시도가 실패했는지. 실패하면 저절로 다시 부르지 않고 버튼을 보여 준다 */
  isFailed: boolean;
  onLoad: () => void;
}

/** 맨 아래에 닿기 전에 미리 부르는 거리. 그리드 칸 서너 줄쯤이다 */
const PRELOAD_DISTANCE_PX = 600;

/**
 * 목록 맨 아래에 두어, 스크롤이 가까이 오면 다음 묶음을 부른다(#273, #274). 실패하면 "다시 불러오기" 버튼을 보여 준다.
 * 화면은 문서가 아니라 안쪽 영역이 스크롤되므로(PageShell) 그 영역을 기준으로 거리를 잰다.
 *
 * @example <LoadMoreTrigger hasMore={hasMore} isLoading={isLoadingMore} isFailed={isMoreFailed} onLoad={loadMore} />
 */
export const LoadMoreTrigger = ({ hasMore, isLoading, isFailed, onLoad }: LoadMoreTriggerProps): ReactElement | null => {
  const markerRef = useRef<HTMLDivElement>(null);
  const handleVisible = useEffectEvent(onLoad);
  const shouldWatch = hasMore && !isLoading && !isFailed;

  // 받은 뒤에도 표시가 아직 가까이 있으면(기록이 적어 화면이 덜 찼을 때) 새로 지켜보는 순간 바로 알려 와 이어서 부른다
  useEffect(() => {
    const marker = markerRef.current;
    if (!shouldWatch || !marker) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) handleVisible();
      },
      { root: findScrollParent(marker), rootMargin: `0px 0px ${PRELOAD_DISTANCE_PX}px 0px` },
    );
    observer.observe(marker);
    return () => observer.disconnect();
  }, [shouldWatch]);

  if (!hasMore && !isFailed) return null;

  return (
    <div ref={markerRef} className="flex flex-col items-center gap-2 py-4 text-center">
      {isFailed ? (
        <>
          <p role="alert" className="text-[12px] text-ink-sub">
            더 불러오지 못했어요.
          </p>
          <button type="button" onClick={onLoad} className="press-wide h-10 rounded-[10px] border border-line bg-surface px-4 text-[13px] text-ink">
            다시 불러오기
          </button>
        </>
      ) : (
        <p role="status" className="text-[12px] text-ink-sub">
          {isLoading ? "불러오는 중…" : ""}
        </p>
      )}
    </div>
  );
};

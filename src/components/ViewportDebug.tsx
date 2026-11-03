"use client";

// TODO(#51): 실기기 값을 잰 뒤 높이 수정 PR에서 지운다

import { useEffect, useState, useSyncExternalStore, type ReactElement } from "react";
import {
  GAP_LABELS,
  toViewportRows,
  VIEWPORT_DEBUG_EVENT,
  VIEWPORT_DEBUG_KEY,
  type ViewportSnapshot,
} from "@/lib/debug/viewport";

// 레이아웃의 인라인 스크립트(VIEWPORT_MEASURE_SCRIPT)가 정의한다
declare global {
  interface Window {
    __luv3MeasureViewport?: () => ViewportSnapshot;
    __luv3ViewportFirst?: ViewportSnapshot;
  }
}

// 사생활 보호 모드 등에서는 저장소 접근이 막혀 예외가 난다. 그때는 꺼진 것으로 본다
const readEnabled = (): boolean => {
  try {
    return window.localStorage.getItem(VIEWPORT_DEBUG_KEY) === "1";
  } catch {
    return false;
  }
};

const saveEnabled = (isEnabled: boolean) => {
  try {
    if (isEnabled) window.localStorage.setItem(VIEWPORT_DEBUG_KEY, "1");
    else window.localStorage.removeItem(VIEWPORT_DEBUG_KEY);
  } catch {
    // 저장소가 막혀 있으면 켤 수 없다. 홈 화면 앱에서는 저장소를 쓸 수 있어 임시 진단 도구로는 충분하다
  }
  window.dispatchEvent(new Event(VIEWPORT_DEBUG_EVENT));
};

const subscribe = (onChange: () => void) => {
  window.addEventListener(VIEWPORT_DEBUG_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(VIEWPORT_DEBUG_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
};
const getServerSnapshot = (): boolean => false;

const useViewportDebugEnabled = (): boolean => useSyncExternalStore(subscribe, readEnabled, getServerSnapshot);

const formatTime = (date: Date): string => date.toLocaleTimeString("ko-KR", { hour12: false });

const ViewportDebugPanel = (): ReactElement => {
  const [first, setFirst] = useState<ViewportSnapshot>();
  const [current, setCurrent] = useState<ViewportSnapshot>();
  const [isFirstFromScript, setIsFirstFromScript] = useState(false);
  const [copyMessage, setCopyMessage] = useState("");
  const [isFolded, setIsFolded] = useState(false);

  useEffect(() => {
    const measure = window.__luv3MeasureViewport;
    if (!measure) return;
    let frame = 0;
    // 크기·스크롤 이벤트는 한 프레임에 여러 번 올 수 있어, 한 프레임에 한 번만 잰다
    const scheduleUpdate = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const snapshot = measure();
        // 진단을 켠 채로 앱을 띄웠으면 하이드레이션 전에 잰 값을 처음 값으로 쓴다
        const early = window.__luv3ViewportFirst;
        setFirst((previous) => previous ?? early ?? snapshot);
        setIsFirstFromScript((previous) => previous || early !== undefined);
        setCurrent(snapshot);
      });
    };

    scheduleUpdate();
    const timer = window.setInterval(scheduleUpdate, 1000);
    const targets: EventTarget[] = [window, ...(window.visualViewport ? [window.visualViewport] : [])];
    const events = ["resize", "scroll", "orientationchange"];
    targets.forEach((target) =>
      events.forEach((name) => target.addEventListener(name, scheduleUpdate, { passive: true })),
    );
    return () => {
      cancelAnimationFrame(frame);
      window.clearInterval(timer);
      targets.forEach((target) => events.forEach((name) => target.removeEventListener(name, scheduleUpdate)));
    };
  }, []);

  const rows = first && current ? toViewportRows(first, current) : [];
  const getCurrent = (label: string): string => rows.find((row) => row.label === label)?.current ?? "-";

  const handleCopy = async () => {
    // 같은 문구가 남아 있으면 이번 복사가 됐는지 알 수 없어 시각을 함께 보여 준다
    const time = formatTime(new Date());
    try {
      await navigator.clipboard.writeText(
        JSON.stringify({ userAgent: navigator.userAgent, first, current }, undefined, 2),
      );
      setCopyMessage(`${time} 복사했어요`);
    } catch {
      setCopyMessage(`${time} 복사하지 못했어요. 화면을 캡처해 주세요`);
    }
  };

  return (
    <>
      {/* 흰 줄은 레이아웃 뷰포트의 아래 끝, 분홍 줄은 실제 화면의 아래 끝. 둘이 어긋나면 그 사이가 여백이다 */}
      <div aria-hidden className="pointer-events-none fixed bottom-0 left-0 z-50 h-1.5 w-1/2 bg-ink" />
      {/* fixed는 레이아웃 뷰포트 밖에 놓여도 문서 높이를 늘리지 않아, 스크롤을 일으켜 값이 바뀌지 않는다 */}
      {current && (
        <div
          aria-hidden
          className="pointer-events-none fixed right-0 z-50 h-1.5 w-1/2 bg-accent"
          style={{ top: current.screenHeight - 6 }}
        />
      )}
      <section
        aria-label="화면 진단"
        className="fixed inset-x-2 top-[calc(env(safe-area-inset-top)+48px)] z-50 max-h-[60%] overflow-y-auto rounded-[10px] border border-line bg-background/90 p-3 font-mono text-[11px] text-ink"
      >
        {isFolded ? (
          <p>
            {GAP_LABELS.dvh} {getCurrent(GAP_LABELS.dvh)} · {GAP_LABELS.fixedInset} {getCurrent(GAP_LABELS.fixedInset)}
          </p>
        ) : (
          <>
            <table className="w-full">
              <thead>
                <tr className="text-ink-sub">
                  <th className="text-left font-normal">값</th>
                  <th className="text-right font-normal">처음</th>
                  <th className="text-right font-normal">지금</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.label} className={row.isChanged ? "text-highlight" : undefined}>
                    <td>{row.label}</td>
                    <td className="text-right">{row.first}</td>
                    <td className="text-right">{row.current}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-ink-sub">
              처음: {isFirstFromScript ? "문서를 읽는 중(앱을 띄운 순간)" : "진단을 켠 뒤 처음 그린 때"}
            </p>
            <p className="text-ink-sub">흰 줄: 레이아웃 아래 끝 · 분홍 줄: 실제 화면 아래 끝</p>
          </>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            aria-expanded={!isFolded}
            onClick={() => setIsFolded((previous) => !previous)}
            className="h-9 rounded-[8px] border border-line px-3"
          >
            {isFolded ? "펴기" : "접기"}
          </button>
          <button type="button" onClick={handleCopy} className="h-9 rounded-[8px] border border-line px-3">
            값 복사
          </button>
          <button type="button" onClick={() => saveEnabled(false)} className="h-9 rounded-[8px] border border-line px-3">
            진단 끄기
          </button>
          <span role="status" className="text-ink-sub">
            {copyMessage}
          </span>
        </div>
      </section>
    </>
  );
};

/** 설정에서 켠 경우에만 화면 높이 값을 위에 겹쳐 보여 주는 임시 진단 표시(#51) */
export const ViewportDebug = (): ReactElement | null => (useViewportDebugEnabled() ? <ViewportDebugPanel /> : null);

/** 설정 화면에서 화면 진단 표시를 켜고 끄는 버튼 */
export const ViewportDebugToggle = (): ReactElement => {
  const isEnabled = useViewportDebugEnabled();

  return (
    <button
      type="button"
      aria-pressed={isEnabled}
      onClick={() => saveEnabled(!isEnabled)}
      className="flex h-[51px] w-full items-center justify-between rounded-[10px] bg-surface px-4 text-[15px] text-ink"
    >
      화면 진단 표시
      <span className="text-[13px] text-ink-sub">{isEnabled ? "켜짐" : "꺼짐"}</span>
    </button>
  );
};

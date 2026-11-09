"use client";

import { useSyncExternalStore, type ReactElement } from "react";
import {
  describeServerSteps,
  describeStylesheets,
  formatMeasuredAt,
  formatSeconds,
  parseStartupTimings,
  STARTUP_TIMING_EVENT,
  STARTUP_TIMING_STORAGE_KEY,
} from "@/lib/pwa/startup-timing";

// TODO(#202): 휴대폰 측정이 끝나면 지운다

const readSaved = (): string | null => {
  try {
    return window.localStorage.getItem(STARTUP_TIMING_STORAGE_KEY);
  } catch {
    return null;
  }
};

// 저장소는 브라우저에만 있어 서버와 첫 하이드레이션에서는 비워 두고 그 뒤에 읽는다.
// 기록은 첫 그림을 기다린 뒤 남겨서, 그 사이 이 화면이 열려 있으면 알림을 받아 다시 읽는다
const subscribe = (onChange: () => void) => {
  window.addEventListener(STARTUP_TIMING_EVENT, onChange);
  return () => window.removeEventListener(STARTUP_TIMING_EVENT, onChange);
};
const getServerSnapshot = (): null => null;

/**
 * 앱을 켤 때 잰 단계별 시간(임시 측정, #202). 최근 기록이 위에 온다.
 *
 * @example <StartupTimingList />
 */
export const StartupTimingList = (): ReactElement => {
  const timings = parseStartupTimings(useSyncExternalStore(subscribe, readSaved, getServerSnapshot));

  return (
    <section aria-labelledby="settings-startup-timing" className="mt-10 flex flex-col">
      <h2 id="settings-startup-timing" className="text-[13px] text-ink-sub">
        앱 켜는 시간 측정(임시)
      </h2>
      <p className="mt-1 text-[12px] leading-[1.6] text-ink-sub">
        켤 때 연결·서버 응답·첫 그림까지 걸린 시간이에요. 아이폰이 앱을 띄우는 시간은 빠져 있어요. 이 휴대폰에만 최근 10번이 남아요.
      </p>
      {timings.length === 0 ? (
        <p className="mt-3 text-[13px] text-ink-sub">아직 기록이 없어요. 앱을 완전히 닫았다가 다시 켜 보세요.</p>
      ) : (
        <ol className="mt-3 flex flex-col gap-2">
          {timings.map((timing) => (
            <li key={timing.measuredAt} className="rounded-[10px] bg-surface px-4 py-3 text-[12px] leading-[1.6] text-ink-sub">
              <p className="text-ink">
                {formatMeasuredAt(timing.measuredAt)} · 첫 그림 {formatSeconds(timing.firstPaintMs)}
              </p>
              <p>
                연결 {formatSeconds(timing.connectMs)} · 서버 응답 {formatSeconds(timing.serverMs)} · 넘김 {formatSeconds(timing.redirectMs)} · 시작 전{" "}
                {formatSeconds(timing.beforeFetchMs)}
              </p>
              <p>{describeServerSteps(timing)}</p>
              <p>{describeStylesheets(timing)}</p>
              <p>
                {timing.isStandalone ? "홈 화면 앱" : "브라우저"} · {timing.path}
              </p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
};

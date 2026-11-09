"use client";

import { useEffect } from "react";
import { isStandaloneDisplay } from "@/lib/pwa/install";
import {
  appendStartupTiming,
  isAppLaunch,
  parseStartupTimings,
  STARTUP_TIMING_EVENT,
  STARTUP_TIMING_STORAGE_KEY,
  toStartupTiming,
  type StylesheetTimingValues,
} from "@/lib/pwa/startup-timing";

// TODO(#202): 휴대폰 측정이 끝나면 지운다

/** 첫 그림 기록을 기다리는 최대 시간(ms). 브라우저가 알려 주지 않으면 비워 둔 채 남긴다 */
const FIRST_PAINT_WAIT = 5_000;

/** 문서 하나에서 한 번만 남긴다. 개발 모드의 Strict Mode는 효과를 두 번 돌린다 */
let hasRecorded = false;

const readFirstContentfulPaint = (): Promise<number | undefined> =>
  new Promise((resolve) => {
    const found = performance.getEntriesByName("first-contentful-paint")[0];
    if (found) {
      resolve(found.startTime);
      return;
    }
    if (!PerformanceObserver.supportedEntryTypes.includes("paint")) {
      resolve(undefined);
      return;
    }
    const timeout = setTimeout(() => {
      observer.disconnect();
      resolve(undefined);
    }, FIRST_PAINT_WAIT);
    const observer = new PerformanceObserver((list) => {
      const entry = list.getEntriesByName("first-contentful-paint")[0];
      if (!entry) return;
      clearTimeout(timeout);
      observer.disconnect();
      resolve(entry.startTime);
    });
    observer.observe({ type: "paint", buffered: true });
  });

const readStylesheets = (): StylesheetTimingValues[] =>
  performance
    .getEntriesByType("resource")
    .filter((entry): entry is PerformanceResourceTiming => entry instanceof PerformanceResourceTiming)
    .filter((entry) => new URL(entry.name).pathname.endsWith(".css"))
    .map(({ startTime, responseEnd, transferSize, decodedBodySize }) => ({ startTime, responseEnd, transferSize, decodedBodySize }));

const recordStartupTiming = async (): Promise<void> => {
  const navigation = performance.getEntriesByType("navigation")[0];
  if (!(navigation instanceof PerformanceNavigationTiming)) return;
  if (!isAppLaunch({ type: navigation.type, referrer: document.referrer, origin: location.origin })) return;

  const timing = toStartupTiming({
    navigation,
    firstContentfulPaint: await readFirstContentfulPaint(),
    stylesheets: readStylesheets(),
    measuredAt: new Date().toISOString(),
    path: location.pathname,
    isStandalone: isStandaloneDisplay(),
  });
  const saved = window.localStorage.getItem(STARTUP_TIMING_STORAGE_KEY);
  window.localStorage.setItem(STARTUP_TIMING_STORAGE_KEY, JSON.stringify(appendStartupTiming(parseStartupTimings(saved), timing)));
  // 첫 그림을 기다리는 동안 설정 화면이 이미 열려 있을 수 있어 다시 읽게 알린다
  window.dispatchEvent(new Event(STARTUP_TIMING_EVENT));
};

/**
 * 앱을 켤 때 단계별 시간을 이 휴대폰의 저장소에 남기는 임시 측정(#202). 설정 화면 아래에서 본다.
 * 서버로 보내지 않고, 인라인 스크립트가 아니라서 보안 헤더(#170)에 더할 것이 없다.
 *
 * @example <StartupTimingRecorder />
 */
export const StartupTimingRecorder = (): null => {
  useEffect(() => {
    if (hasRecorded) return;
    hasRecorded = true;
    // 측정은 앱 동작과 상관없어서, 저장소가 막혔거나 브라우저가 기록을 주지 않으면 남기지 않고 넘어간다
    recordStartupTiming().catch(() => undefined);
  }, []);

  return null;
};

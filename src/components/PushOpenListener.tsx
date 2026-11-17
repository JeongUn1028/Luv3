"use client";

import { useRouter } from "next/navigation";
import { startTransition, useEffect } from "react";
import { refreshOutsideForm } from "@/lib/navigation/refresh-outside-form";
import { FORWARD_TRANSITION } from "@/lib/navigation/transition";
import { PUSH_OPEN_MESSAGE } from "@/lib/push/message";
import { readPushOpenPath } from "@/lib/push/open-message";

/**
 * 앱을 켜 둔 채 알림을 누르면, 서비스 워커가 넘긴 주소로 앱 안에서 옮긴다(#406). 화면에 내용을 그리지 않는다.
 * 창을 통째로 옮기면 쓰던 글·고른 사진이 사라지지만, 앱 안 이동은 쓰던 폼을 숨겨 둔 채 남기고 하던 저장도 이어 간다.
 * 받았다고 답해야 서비스 워커가 창을 옮기지 않는다(`public/sw.js`).
 *
 * @example <PushOpenListener />
 */
export const PushOpenListener = (): null => {
  const router = useRouter();

  useEffect(() => {
    // 서비스 워커를 지원하지 않는 브라우저는 알림도 받지 않는다
    if (!("serviceWorker" in navigator)) return;
    const { serviceWorker } = navigator;
    const handleMessage = (event: MessageEvent<unknown>) => {
      const path = readPushOpenPath(event.data, window.location.origin);
      if (path === undefined) return;
      event.ports[0]?.postMessage({ type: PUSH_OPEN_MESSAGE });
      const { pathname, search, hash } = window.location;
      // 보고 있는 화면의 알림(새 댓글 등)이면 옮기지 않고 새로 받는다. 같은 주소로 옮기면 방문 기록만 하나 늘어난다
      if (path === `${pathname}${search}${hash}`) {
        refreshOutsideForm(() => startTransition(() => router.refresh()));
        return;
      }
      router.push(path, { transitionTypes: FORWARD_TRANSITION });
    };
    serviceWorker.addEventListener("message", handleMessage);
    return () => serviceWorker.removeEventListener("message", handleMessage);
  }, [router]);

  return null;
};

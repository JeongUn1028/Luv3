"use client";

import { useEffect } from "react";
import { isObject } from "@/lib/guards";
import { subscribeToAppReturn } from "@/lib/navigation/app-return";
import { PUSH_RECEIVED_MESSAGE } from "@/lib/push/message";
import { createClient } from "@/lib/supabase/client";

/** 앱 아이콘 숫자와, 서버가 세는 "앱을 연 뒤 받은 알림 수"를 0으로 한다 */
const clearBadge = async (): Promise<void> => {
  // 숫자를 지원하지 않는 브라우저는 조용히 건너뛴다
  if ("clearAppBadge" in navigator) navigator.clearAppBadge().catch(() => undefined);

  const supabase = createClient();
  // 로그인 화면처럼 세션이 없으면 묻지 않는다. 물으면 거절돼 "로그인이 끊겼어요" 창(#102)이 뜬다
  const { data } = await supabase.auth.getSession();
  if (!data.session) return;
  const { error } = await supabase.rpc("clear_push_badge");
  // 지우지 못하면 다음 알림에 숫자가 이어 붙는다. 다음에 앱을 열 때 다시 지운다
  if (error) console.error(new Error("앱 아이콘 숫자를 지우지 못했습니다.", { cause: error }));
};

/**
 * 앱을 열면(화면이 보이게 되면) 앱 아이콘 숫자를 지운다(#364). 화면에 내용을 그리지 않는다.
 * 앱을 보고 있는 동안 알림이 오면 서비스 워커가 알려 주므로(`public/sw.js`) 그때도 지운다.
 * 알림 열쇠가 없는 환경(알림 기능을 켜기 전)에서는 아무것도 하지 않는다.
 *
 * @example <PushBadgeReset />
 */
export const PushBadgeReset = (): null => {
  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) return;
    const handleOpen = () => {
      clearBadge().catch((error: unknown) => console.error(new Error("앱 아이콘 숫자를 지우지 못했습니다.", { cause: error })));
    };
    const handleMessage = (event: MessageEvent<unknown>) => {
      if (isObject(event.data) && event.data.type === PUSH_RECEIVED_MESSAGE && document.visibilityState === "visible") handleOpen();
    };
    handleOpen();
    const unsubscribeReturn = subscribeToAppReturn(handleOpen);
    // 서비스 워커를 지원하지 않는 브라우저는 알림도 받지 않는다
    const serviceWorker = "serviceWorker" in navigator ? navigator.serviceWorker : undefined;
    serviceWorker?.addEventListener("message", handleMessage);
    return () => {
      unsubscribeReturn();
      serviceWorker?.removeEventListener("message", handleMessage);
    };
  }, []);

  return null;
};

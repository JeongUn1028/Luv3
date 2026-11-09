"use client";

import { useRouter } from "next/navigation";
import { startTransition, useEffect, useState } from "react";
import { isBackMotionPending } from "@/lib/navigation/history-back";
import { isWritingPath } from "@/lib/navigation/save-notices";
import { isScreenStale, markAllScreensLoaded, markScreenLoaded } from "@/lib/navigation/screen-freshness";
import { createClient } from "@/lib/supabase/client";

/** 뒤로 가는 움직임(260ms)이 끝난 뒤에 불러온다. 움직이는 중에 불러오면 Next의 같은 상태에 묶여 돌아오는 화면까지 응답을 기다린다 */
const REFRESH_DELAY_MS = 300;

/**
 * 기록을 되돌아간 화면을 챙긴다. 화면에 내용을 그리지 않는다.
 * - 되돌아간 화면은 숨겨 둔 그대로라 상대가 고친 내용이 없을 수 있어, 받은 지 오래됐으면 뒤에서 새로 불러온다. 쓰던 내용이 사라지므로 폼에서는 불러오지 않는다.
 *   로그인이 풀렸으면 서버가 로그인 화면으로 보내 숨겨 둔 폼까지 잃으므로 불러오지 않는다(#102). 인터넷이 끊겼을 때도 여기서 그만둔다.
 * - React는 popstate 안의 첫 전환을 그 자리에서 바로 그려 화면 전환을 건너뛴다(브라우저가 스스로 그리는 경우를 위해서다).
 *   뒤로 버튼으로 돌아갈 때는 Next보다 먼저 빈 전환을 넣어 그 차례를 써 버려, Next의 전환이 움직임과 함께 돌게 한다.
 *   Next는 자식보다 나중에 듣기 시작하므로 이 컴포넌트가 먼저 불린다.
 *
 * @example <HistoryReturn />
 */
export const HistoryReturn = (): null => {
  const router = useRouter();
  const [, setPopCount] = useState(0);

  useEffect(() => {
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;

    const handlePopState = () => {
      if (isBackMotionPending()) startTransition(() => setPopCount((count) => count + 1));

      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(async () => {
        const { href, pathname } = window.location;
        if (isWritingPath(pathname) || !isScreenStale(href, href)) return;

        const { data } = await createClient().auth.getUser();
        // 확인하는 사이 폼으로 옮겼을 수 있어 다시 본다
        if (!data.user || isWritingPath(window.location.pathname)) return;
        markAllScreensLoaded();
        // 모두 오래된 것으로 친 뒤(#164)에는 이 화면이 적혀 있지 않아, 적지 않으면 앱에 돌아올 때마다 새로 받는다(#163)
        markScreenLoaded(href, href);
        startTransition(() => router.refresh());
      }, REFRESH_DELAY_MS);
    };

    window.addEventListener("popstate", handlePopState);
    return () => {
      clearTimeout(refreshTimer);
      window.removeEventListener("popstate", handlePopState);
    };
  }, [router]);

  return null;
};

"use client";

import { useRouter } from "next/navigation";
import { startTransition, useEffect } from "react";
import { shouldRefreshOnReturn } from "@/lib/navigation/app-return";
import { refreshOutsideForm } from "@/lib/navigation/refresh-outside-form";
import { getScreenLoadedAt, markAllScreensLoaded } from "@/lib/navigation/screen-freshness";
import { createClient } from "@/lib/supabase/client";

/**
 * 홈 화면 앱으로 돌아오면 오래된 화면을 새로 받는다(#163). 화면에 내용을 그리지 않는다.
 * 켜 둔 앱은 다시 불러오지 않아 상대가 고친 내용, 지난 일정과 "오늘" 표시가 남고, 사진 주소가 만료돼 빈 칸이 된다.
 * 받은 지 30분이 지났거나 날짜가 바뀌었을 때만 받고, 쓰던 폼은 지킨다(#164).
 *
 * @example <AppReturn />
 */
export const AppReturn = (): null => {
  const router = useRouter();

  useEffect(() => {
    let isChecking = false;

    const handleReturn = async () => {
      if (document.visibilityState !== "visible" || isChecking) return;
      const { href } = window.location;
      if (!shouldRefreshOnReturn(getScreenLoadedAt(href, href), Date.now())) return;

      isChecking = true;
      try {
        const { data } = await createClient().auth.getUser();
        // 로그인이 풀렸으면 서버가 로그인 화면으로 보내 숨겨 둔 폼까지 잃는다(#102). 인터넷이 끊겼을 때도 여기서 그만둔다
        if (!data.user) return;
        refreshOutsideForm(() => {
          // router.refresh()는 숨겨 둔 화면까지 비워 돌아갈 때 Next가 새로 받으므로, 표시가 없으면 같은 요청과 사진을 두 번 받는다
          markAllScreensLoaded();
          startTransition(() => router.refresh());
        });
      } finally {
        isChecking = false;
      }
    };

    // 저장된 페이지로 되살아날 때(pageshow)는 visibilitychange가 오지 않을 수 있어 함께 듣는다
    document.addEventListener("visibilitychange", handleReturn);
    window.addEventListener("pageshow", handleReturn);
    return () => {
      document.removeEventListener("visibilitychange", handleReturn);
      window.removeEventListener("pageshow", handleReturn);
    };
  }, [router]);

  return null;
};

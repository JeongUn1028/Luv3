"use client";

import { useRouter } from "next/navigation";
import { startTransition, useEffect } from "react";
import { shouldRefreshOnReturn, subscribeToAppReturn } from "@/lib/navigation/app-return";
import { refreshSignedInScreen } from "@/lib/navigation/refresh-signed-in";
import { getScreenLoadedAt } from "@/lib/navigation/screen-freshness";

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
      if (isChecking) return;
      const { href } = window.location;
      if (!shouldRefreshOnReturn(getScreenLoadedAt(href, href), Date.now())) return;

      isChecking = true;
      try {
        await refreshSignedInScreen(() => startTransition(() => router.refresh()));
      } finally {
        isChecking = false;
      }
    };

    return subscribeToAppReturn(handleReturn);
  }, [router]);

  return null;
};

"use client";

import { useLayoutEffect } from "react";
import { recordsLoadFailedCount } from "@/lib/dates/search";

/**
 * 기록 탭의 조회 실패 문구 옆에 둔다. 보이는 동안 머리글의 돋보기가 찾기를 열지 않게 알린다(#261).
 * 다시 시도해 기록을 받으면 실패 문구와 함께 사라지면서 돋보기도 다시 눌린다.
 *
 * @example <><RecordsLoadFailedMark /><LoadErrorMessage message={tiles.message} /></>
 */
export const RecordsLoadFailedMark = (): null => {
  // 문구가 화면에 그려지기 전에 알려 돋보기가 같은 화면에서 함께 막혀 보이게 한다. 숨겨지면(Activity) 정리되어 수에서 빠진다
  useLayoutEffect(() => {
    recordsLoadFailedCount.set(recordsLoadFailedCount.get() + 1);
    return () => recordsLoadFailedCount.set(recordsLoadFailedCount.get() - 1);
  }, []);

  return null;
};

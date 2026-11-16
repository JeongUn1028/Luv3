"use client";

import { useEffectEvent, useLayoutEffect, type Dispatch, type SetStateAction } from "react";
import { toKstDate } from "@/lib/anniversary";
import { subscribeToAppReturn } from "@/lib/navigation/app-return";
import type { RecordDraft } from "./record-draft";

interface UseUntouchedDateTodayParams {
  /** 오늘을 기본값으로 연 새 기록 폼인지(고치기·일정에서 넘어온 폼이 아님) */
  isEnabled: boolean;
  /** 날짜를 직접 고친 것도 쓴 내용이라 그대로 둔다 */
  hasWrittenContent: boolean;
  date: string;
  setInitialDraft: Dispatch<SetStateAction<RecordDraft>>;
  setDraft: Dispatch<SetStateAction<RecordDraft>>;
}

/**
 * 오늘을 기본값으로 연 새 기록 폼은 다시 보일 때 아무것도 쓰지 않았으면 날짜를 오늘로 맞춘다(#162).
 * 화면을 새로 받아도 같은 key라 처음 그린 날의 날짜가 남는다. 숨겨 둔 폼(Activity)은 다시 보일 때 효과가 다시 돌고,
 * 보고 있던 폼은 앱으로 돌아올 때 알림을 받는다. 그리기 전에 맞춰 어제 날짜가 잠깐 보이지 않게 한다.
 *
 * @example useUntouchedDateToday({ isEnabled: !record && !prefill, hasWrittenContent, date: draft.date, setInitialDraft, setDraft })
 */
export const useUntouchedDateToday = ({ isEnabled, hasWrittenContent, date, setInitialDraft, setDraft }: UseUntouchedDateTodayParams): void => {
  const moveUntouchedDateToToday = useEffectEvent(() => {
    const currentToday = toKstDate(new Date());
    if (hasWrittenContent || date >= currentToday) return;
    setInitialDraft((current) => ({ ...current, date: currentToday }));
    setDraft((current) => ({ ...current, date: currentToday }));
  });
  useLayoutEffect(() => {
    if (!isEnabled) return;
    // 효과 안에서 상태를 바꾸는 예외다(react-hooks/set-state-in-effect). 다시 보일 때 바깥 시계에 맞추고, 날짜가 지났을 때만 바꿔 연달아 그리지 않는다
    moveUntouchedDateToToday();
    return subscribeToAppReturn(moveUntouchedDateToToday);
  }, [isEnabled]);
};

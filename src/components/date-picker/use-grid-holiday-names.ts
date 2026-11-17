"use client";

import { useEffect, useState } from "react";
import type { CalendarDay } from "@/lib/calendar/month";
import { loadHolidayNames } from "@/lib/holidays/client";
import type { HolidayNames } from "@/lib/holidays/holidays";

/**
 * 날짜 선택 창이 그린 달력에 칠할 공휴일 이름. 창이 닫혀 달력이 없으면 받지 않는다.
 *
 * @example const holidayNames = useGridHolidayNames(view && buildMonthGrid(view.month));
 */
export const useGridHolidayNames = (weeks: CalendarDay[][] | undefined): HolidayNames => {
  const [holidayNames, setHolidayNames] = useState<HolidayNames>({});
  // 12월·1월 달력은 앞뒤 해의 날도 그리므로 두 해를 함께 받는다
  const gridStartYear = weeks && Number(weeks[0]?.[0]?.date.slice(0, 4));
  const gridEndYear = weeks && Number(weeks.at(-1)?.at(-1)?.date.slice(0, 4));

  // 공휴일은 서버 API(외부 시스템)에서 받아 보고 있는 해에 맞춘다. 받지 못하면 주말 색만 칠한다(원인은 서버가 로그에 남긴다)
  useEffect(() => {
    if (gridStartYear === undefined || gridEndYear === undefined) return undefined;
    let isMounted = true;
    for (const year of new Set([gridStartYear, gridEndYear])) {
      loadHolidayNames(year).then(
        (names) => {
          if (isMounted) setHolidayNames((previous) => ({ ...previous, ...names }));
        },
        () => undefined,
      );
    }
    return () => {
      isMounted = false;
    };
  }, [gridStartYear, gridEndYear]);

  return holidayNames;
};

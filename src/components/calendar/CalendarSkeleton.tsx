import type { ReactElement } from "react";
import { SkeletonArea, SkeletonBlock } from "@/components/Skeleton";

/** 달마다 4~6주지만 가장 흔한 5주로 자리를 잡는다 */
const DAY_KEYS = Array.from({ length: 35 }, (_, index) => `day-${index}`);

/** 캘린더 탭을 불러오는 동안의 뼈대: 달 이름 + 날짜 칸 + 고른 날(CalendarView와 같은 간격) */
export const CalendarSkeleton = (): ReactElement => (
  <SkeletonArea className="px-4">
    <div className="flex h-[52px] items-center pt-2">
      <SkeletonBlock className="h-6 w-32 rounded-[4px]" />
    </div>
    <div className="mt-10 grid grid-cols-7 gap-1">
      {DAY_KEYS.map((key) => (
        <SkeletonBlock key={key} className="h-12 rounded-[10px]" />
      ))}
    </div>
    <SkeletonBlock className="mt-10 h-5 w-36 rounded-[4px]" />
    <SkeletonBlock className="mt-3 h-[51px] rounded-[10px]" />
  </SkeletonArea>
);

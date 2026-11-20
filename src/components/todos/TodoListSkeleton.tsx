import type { ReactElement } from "react";
import { SkeletonArea, SkeletonBlock } from "@/components/Skeleton";

const ROWS = [
  { key: "a", width: "w-3/5" },
  { key: "b", width: "w-2/5" },
  { key: "c", width: "w-1/2" },
] as const;

/** 하고 싶은 것 탭을 불러오는 동안의 뼈대: 구역 제목 줄 + 체크 칸·글자 줄(TodoList의 구역 제목 줄·한 줄과 같은 높이, #497) */
export const TodoListSkeleton = (): ReactElement => (
  <SkeletonArea>
    <div className="flex min-h-11 items-center">
      <SkeletonBlock className="h-3.5 w-14 rounded-[4px]" />
    </div>
    {ROWS.map(({ key, width }) => (
      <div key={key} className="flex min-h-[60px] items-center border-b border-line">
        <div className="flex size-11 shrink-0 items-center justify-center">
          <SkeletonBlock className="size-5 rounded-[4px]" />
        </div>
        <SkeletonBlock className={`h-5 rounded-[4px] ${width}`} />
      </div>
    ))}
  </SkeletonArea>
);

import type { ReactElement } from "react";
import { SkeletonArea, SkeletonBlock } from "@/components/Skeleton";

const ROWS = [
  { key: "a", width: "w-3/5" },
  { key: "b", width: "w-2/5" },
  { key: "c", width: "w-1/2" },
] as const;

/** Todo 탭을 불러오는 동안의 뼈대: 체크 칸 + 글자 줄(TodoList 한 줄과 같은 높이) */
export const TodoListSkeleton = (): ReactElement => (
  <SkeletonArea className="pt-2">
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

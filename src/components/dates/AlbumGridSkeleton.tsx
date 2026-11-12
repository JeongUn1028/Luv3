import type { ReactElement } from "react";
import { SkeletonArea, SkeletonBlock } from "@/components/Skeleton";

/** 화면을 넘칠 만큼의 칸 수. 넘친 칸은 SkeletonArea가 자른다 */
const TILE_KEYS = ["a", "b", "c", "d", "e", "f"] as const;

/** 기록 탭을 불러오는 동안의 뼈대: 달 이름 + 2열 칸(AlbumGrid와 같은 간격) */
export const AlbumGridSkeleton = (): ReactElement => (
  <SkeletonArea className="mt-[11px]">
    <SkeletonBlock className="h-[22px] w-24 rounded-[4px]" />
    <div className="mt-2 grid grid-cols-2 gap-1.5">
      {TILE_KEYS.map((key) => (
        <SkeletonBlock key={key} className="aspect-[4/5] rounded-[8px]" />
      ))}
    </div>
  </SkeletonArea>
);

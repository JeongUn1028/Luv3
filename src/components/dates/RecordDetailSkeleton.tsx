import type { ReactElement } from "react";
import { SkeletonArea, SkeletonBlock } from "@/components/Skeleton";

/** 기록 상세를 불러오는 동안의 뼈대: 사진 + 날짜 + 제목 + 글(머리글 아래, 실제 상세와 같은 간격) */
export const RecordDetailSkeleton = (): ReactElement => (
  <SkeletonArea>
    <SkeletonBlock className="mx-4 aspect-[4/5] rounded-[16px]" />
    <div className="px-4 pt-6">
      <SkeletonBlock className="h-4 w-40 rounded-[4px]" />
      <SkeletonBlock className="mt-2 h-[31px] w-3/5 rounded-[4px]" />
      <SkeletonBlock className="mt-5 h-5 w-full rounded-[4px]" />
    </div>
  </SkeletonArea>
);

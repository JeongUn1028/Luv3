import type { ReactElement } from "react";
import { SkeletonBlock } from "@/components/Skeleton";

// 칸마다 실제 내용과 같은 크기로 자리를 잡아, 불러온 뒤 홈 배치(#77)가 밀리지 않게 한다.
// 실제 칸의 여백·글자 크기를 바꾸면 여기도 같이 맞춘다

/** DdayHeader 자리(52px). 칸마다 알리면 시끄러워 맨 위 칸에서만 불러오는 중임을 알린다 */
export const DdaySkeleton = (): ReactElement => (
  <>
    <p role="status" className="sr-only">
      불러오는 중이에요
    </p>
    <SkeletonBlock className="h-[52px] w-[150px] rounded-[10px]" />
  </>
);

/** 커플 사진 자리. 사진이 있을 때가 대부분이라 사진 칸 크기로 둔다 */
export const CouplePhotoSkeleton = (): ReactElement => (
  <SkeletonBlock className="aspect-[4/3] w-full shrink-0 grow rounded-[16px]" />
);

/** 최근 데이트·일정의 정사각형 칸 */
export const HomeTileSkeleton = (): ReactElement => (
  <div aria-hidden="true" className="flex aspect-square flex-col gap-2 rounded-[16px] bg-surface px-3.5 py-3">
    <SkeletonBlock tone="line" className="h-5 w-16 rounded-[4px]" />
    <SkeletonBlock tone="line" className="h-4 w-full rounded-[4px]" />
    <SkeletonBlock tone="line" className="h-4 w-2/3 rounded-[4px]" />
  </div>
);

/** 하고 싶은 것 칸. 높이는 내용이 한 줄일 때의 TodoPreview 높이(72px)다 */
export const TodoPreviewSkeleton = (): ReactElement => (
  <div aria-hidden="true" className="mt-4 flex h-[72px] shrink-0 flex-col gap-2 rounded-[16px] bg-surface px-3.5 py-3">
    <SkeletonBlock tone="line" className="h-5 w-20 rounded-[4px]" />
    <SkeletonBlock tone="line" className="h-5 w-3/4 rounded-[4px]" />
  </div>
);

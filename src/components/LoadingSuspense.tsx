import { Suspense, ViewTransition, type ReactElement, type ReactNode } from "react";
import { SCREEN_MOTION } from "@/lib/navigation/transition";

interface LoadingSuspenseProps {
  /** 불러오는 동안 보여 줄 뼈대. 스크롤 영역을 넘지 않는 크기여야 한다(SkeletonArea) */
  fallback: ReactNode;
  children: ReactNode;
}

/**
 * 불러오는 동안 뼈대를 보여 주고, 다 되면 내용으로 바로 바꾸는 Suspense. 뼈대를 내용 위에서 지우면 그동안 둘이 겹쳐 보인다(#88).
 * 내용 쪽도 움직이지 않는다. 움직임을 주면 전환하는 동안 그 영역을 누를 수 없고, 스크롤 영역보다 긴 내용이 머리글·하단 탭을 덮는다.
 * 작성·고치기 화면처럼 뼈대가 화면 틀째 들어올 때는 다른 화면처럼 밀려 들어오도록 enter도 준다.
 *
 * @example
 * <LoadingSuspense fallback={<AlbumGridSkeleton />}>
 *   <RecordsContent />
 * </LoadingSuspense>
 */
export const LoadingSuspense = ({ fallback, children }: LoadingSuspenseProps): ReactElement => (
  <Suspense
    fallback={
      <ViewTransition enter={SCREEN_MOTION} exit={SCREEN_MOTION} default="none">
        {fallback}
      </ViewTransition>
    }
  >
    {children}
  </Suspense>
);

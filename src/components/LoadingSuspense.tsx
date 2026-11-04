import { Suspense, ViewTransition, type ReactElement, type ReactNode } from "react";
import { SCREEN_MOTION } from "@/lib/navigation/transition";

/** 뼈대가 실제 내용으로 바뀔 때는 종류 없는 전환이라 뼈대만 사라지게 하고, 화면을 떠날 때는 화면과 같이 움직인다 */
const SKELETON_EXIT_MOTION = { ...SCREEN_MOTION, default: "reveal" };

interface LoadingSuspenseProps {
  /** 불러오는 동안 보여 줄 뼈대. 스크롤 영역을 넘지 않는 크기여야 한다(SkeletonArea) */
  fallback: ReactNode;
  children: ReactNode;
}

/**
 * 뼈대가 실제 내용 위에서 부드럽게 사라지는 Suspense.
 * 내용 쪽은 움직이지 않는다. 움직임을 주면 전환하는 동안 그 영역을 누를 수 없고, 스크롤 영역보다 긴 내용이 머리글·하단 탭을 덮는다.
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
      <ViewTransition enter={SCREEN_MOTION} exit={SKELETON_EXIT_MOTION} default="none">
        {fallback}
      </ViewTransition>
    }
  >
    {children}
  </Suspense>
);

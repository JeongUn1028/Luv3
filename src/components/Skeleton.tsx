import type { ReactElement, ReactNode } from "react";

const TONE_CLASS_NAME = {
  /** 화면 배경 위에 놓는 덩어리 */
  surface: "bg-surface",
  /** 칸(bg-surface) 안에 놓는 글자 줄 */
  line: "bg-line",
} as const;

interface SkeletonBlockProps {
  /** 크기와 모서리 */
  className: string;
  tone?: keyof typeof TONE_CLASS_NAME;
}

/**
 * 불러오는 동안 실제 내용 자리를 잡는 덩어리. 모션 줄이기 설정이면 깜빡이지 않는다.
 *
 * @example <SkeletonBlock className="h-[51px] rounded-[10px]" />
 */
export const SkeletonBlock = ({ className, tone = "surface" }: SkeletonBlockProps): ReactElement => (
  <div aria-hidden="true" className={`motion-safe:animate-pulse ${TONE_CLASS_NAME[tone]} ${className}`} />
);

interface SkeletonAreaProps {
  className?: string;
  children: ReactNode;
}

/**
 * 뼈대 화면을 감싸 스크린 리더에 불러오는 중임을 알린다. 넘치는 뼈대는 잘라 불러오는 동안 스크롤이 생기지 않게 한다.
 *
 * @example <SkeletonArea className="px-4"><SkeletonBlock className="h-6 w-20" /></SkeletonArea>
 */
export const SkeletonArea = ({ className = "", children }: SkeletonAreaProps): ReactElement => (
  <div className={`relative min-h-0 flex-1 overflow-hidden ${className}`}>
    <p role="status" className="sr-only">
      불러오는 중이에요
    </p>
    {children}
  </div>
);

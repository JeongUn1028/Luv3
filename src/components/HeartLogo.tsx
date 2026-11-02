import type { ReactElement } from "react";

interface HeartLogoProps {
  className?: string;
  /** viewBox(100×100) 기준 선 두께. 작게 그릴수록 두껍게 준다. */
  strokeWidth?: number;
}

/** Luv3 하트 라인 로고. 색은 `currentColor`라 `text-*` 클래스로 바꾼다. */
export const HeartLogo = ({ className, strokeWidth = 2.4 }: HeartLogoProps): ReactElement => (
  <svg viewBox="0 0 100 100" className={className} aria-hidden="true" focusable="false">
    <path
      d="M50 86 C23 67 8 50 8 32 C8 19 18 10 30 10 C39 10 46 15 50 23 C54 15 61 10 70 10 C82 10 92 19 92 32 C92 50 77 67 50 86 Z"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinejoin="round"
    />
  </svg>
);

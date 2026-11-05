import type { ReactElement } from "react";

// 가운데 오목한 곳에서 시작해 아래 끝에서 만나는 두 선
const HEART_LINES = [
  "M50 23 C46 15 39 10 30 10 C18 10 8 19 8 32 C8 50 23 67 50 86",
  "M50 23 C54 15 61 10 70 10 C82 10 92 19 92 32 C92 50 77 67 50 86",
] as const;

interface HeartLogoProps {
  className?: string;
  /** viewBox(100×100) 기준 선 두께. 작게 그릴수록 두껍게 준다. */
  strokeWidth?: number;
  /** 두 선을 따로 그린다. 시작 화면이 선마다 움직임을 준다(#131). 겹치는 끝이 두 번 칠해지므로 평소에는 한 선으로 그린다 */
  isSplit?: boolean;
}

/** Luv3 하트 라인 로고. 색은 `currentColor`라 `text-*` 클래스로 바꾼다. */
export const HeartLogo = ({ className, strokeWidth = 2.4, isSplit = false }: HeartLogoProps): ReactElement => (
  <svg viewBox="0 0 100 100" className={className} aria-hidden="true" focusable="false">
    {(isSplit ? HEART_LINES : [HEART_LINES.join(" ")]).map((line) => (
      <path
        key={line}
        d={line}
        // 선 전체 길이를 1로 잡아 움직임이 선 길이를 몰라도 되게 한다
        pathLength={1}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ))}
  </svg>
);

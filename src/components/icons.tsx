import type { ReactElement, ReactNode } from "react";

interface IconProps {
  className?: string;
}

/** 24×24 선 아이콘. 색은 `currentColor`라 `text-*` 클래스로 바꾼다. 의미는 감싸는 버튼·링크의 이름으로 전한다. */
const LineIcon = ({ className, children }: IconProps & { children: ReactNode }): ReactElement => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.5}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
    focusable="false"
  >
    {children}
  </svg>
);

/** 기록(사진 그리드) 탭 아이콘. home.svg의 앨범 아이콘과 같다. */
export const GridIcon = ({ className }: IconProps): ReactElement => (
  <LineIcon className={className}>
    <rect x="3.5" y="3.5" width="7" height="7" />
    <rect x="13.5" y="3.5" width="7" height="7" />
    <rect x="3.5" y="13.5" width="7" height="7" />
    <rect x="13.5" y="13.5" width="7" height="7" />
  </LineIcon>
);

/** 캘린더 탭 아이콘 */
export const CalendarIcon = ({ className }: IconProps): ReactElement => (
  <LineIcon className={className}>
    <rect x="3.5" y="5" width="17" height="15.5" rx="1.5" />
    <path d="M3.5 10h17M8 3v4M16 3v4" />
  </LineIcon>
);

/** 설정 아이콘. home.svg의 설정(슬라이더) 아이콘과 같다. */
export const SettingsIcon = ({ className }: IconProps): ReactElement => (
  <LineIcon className={className}>
    <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
    <circle cx="16" cy="7" r="2" />
    <circle cx="10" cy="17" r="2" />
  </LineIcon>
);

/** 뒤로 가기 아이콘 */
export const BackIcon = ({ className }: IconProps): ReactElement => (
  <LineIcon className={className}>
    <path d="M15 5l-7 7 7 7" />
  </LineIcon>
);

/** 더하기 아이콘. 기록 남기기 버튼에 쓴다 */
export const PlusIcon = ({ className }: IconProps): ReactElement => (
  <LineIcon className={className}>
    <path d="M12 5v14M5 12h14" />
  </LineIcon>
);

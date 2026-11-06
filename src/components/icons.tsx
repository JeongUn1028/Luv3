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

/** 돋보기(기록 찾기) */
export const SearchIcon = ({ className }: IconProps): ReactElement => (
  <LineIcon className={className}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m20 20-4.4-4.4" />
  </LineIcon>
);

/** 닫기(찾기 닫기) */
export const CloseIcon = ({ className }: IconProps): ReactElement => (
  <LineIcon className={className}>
    <path d="M6 6l12 12" />
    <path d="M18 6 6 18" />
  </LineIcon>
);

/** 홈 탭 아이콘 */
export const HomeIcon = ({ className }: IconProps): ReactElement => (
  <LineIcon className={className}>
    <path d="M3.5 10.5 12 4l8.5 6.5" />
    <path d="M5.5 9v11.5h13V9" />
    <path d="M10 20.5V15h4v5.5" />
  </LineIcon>
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

/** Todo-list 탭 아이콘(체크 표시가 붙은 목록) */
export const TodoIcon = ({ className }: IconProps): ReactElement => (
  <LineIcon className={className}>
    <path d="M3.5 6.5 5 8l2.5-3M3.5 12.5 5 14l2.5-3" />
    <path d="M11 6.5h9.5M11 12.5h9.5M11 18.5h9.5M4 18.5h3" />
  </LineIcon>
);

/** 설정(톱니바퀴) 아이콘. 홈 오른쪽 위에 둔다 */
export const SettingsIcon = ({ className }: IconProps): ReactElement => (
  <LineIcon className={className}>
    <circle cx="12" cy="12" r="3" />
    <path d="M10.3 3.5h3.4l.5 2.4 1.6.9 2.3-.8 1.7 2.9-1.8 1.6v1.9l1.8 1.6-1.7 2.9-2.3-.8-1.6.9-.5 2.4h-3.4l-.5-2.4-1.6-.9-2.3.8-1.7-2.9 1.8-1.6v-1.9L4.2 8.9l1.7-2.9 2.3.8 1.6-.9z" />
  </LineIcon>
);

/** 뒤로 가기 아이콘 */
export const BackIcon = ({ className }: IconProps): ReactElement => (
  <LineIcon className={className}>
    <path d="M15 5l-7 7 7 7" />
  </LineIcon>
);

/** 지도 핀 아이콘. 기록 탭의 지도 버튼에 쓴다 */
export const MapPinIcon = ({ className }: IconProps): ReactElement => (
  <LineIcon className={className}>
    <path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z" />
    <circle cx="12" cy="9.5" r="2.5" />
  </LineIcon>
);

/** 더하기 아이콘. 탭 오른쪽 위의 추가 버튼(기록 남기기·일정 추가)에 쓴다 */
export const PlusIcon = ({ className }: IconProps): ReactElement => (
  <LineIcon className={className}>
    <path d="M12 5v14M5 12h14" />
  </LineIcon>
);

/** 앞으로(왼쪽) 화살표. 사진 넘기기에 쓴다 */
export const ChevronLeftIcon = ({ className }: IconProps): ReactElement => (
  <LineIcon className={className}>
    <path d="M14.5 6l-6 6 6 6" />
  </LineIcon>
);

/** 뒤로(오른쪽) 화살표. 사진 넘기기에 쓴다 */
export const ChevronRightIcon = ({ className }: IconProps): ReactElement => (
  <LineIcon className={className}>
    <path d="M9.5 6l6 6-6 6" />
  </LineIcon>
);

/** 왼쪽 두 겹 꺾쇠. 날짜 선택 창에서 이전 해로 옮기는 버튼에 쓴다 */
export const ChevronsLeftIcon = ({ className }: IconProps): ReactElement => (
  <LineIcon className={className}>
    <path d="M11.5 6l-6 6 6 6M18 6l-6 6 6 6" />
  </LineIcon>
);

/** 오른쪽 두 겹 꺾쇠. 날짜 선택 창에서 다음 해로 옮기는 버튼에 쓴다 */
export const ChevronsRightIcon = ({ className }: IconProps): ReactElement => (
  <LineIcon className={className}>
    <path d="M6 6l6 6-6 6M12.5 6l6 6-6 6" />
  </LineIcon>
);

/** 위쪽 꺾쇠. Todo 순서를 한 칸 위로 옮기는 버튼에 쓴다 */
export const ChevronUpIcon = ({ className }: IconProps): ReactElement => (
  <LineIcon className={className}>
    <path d="M6 15l6-6 6 6" />
  </LineIcon>
);

/** 아래쪽 꺾쇠. Todo 순서를 한 칸 아래로 옮기는 버튼에 쓴다 */
export const ChevronDownIcon = ({ className }: IconProps): ReactElement => (
  <LineIcon className={className}>
    <path d="M6 9l6 6 6-6" />
  </LineIcon>
);

/** 카메라 아이콘. 홈 커플 사진 모서리의 바꾸기 버튼에 쓴다 */
export const CameraIcon = ({ className }: IconProps): ReactElement => (
  <LineIcon className={className}>
    <path d="M4.5 7.5h3l1.5-2.5h6l1.5 2.5h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1v-10a1 1 0 0 1 1-1z" />
    <circle cx="12" cy="13" r="3.5" />
  </LineIcon>
);

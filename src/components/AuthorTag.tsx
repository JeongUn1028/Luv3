import type { ReactElement } from "react";

interface AuthorTagProps {
  /** 작성자 전체 닉네임. 폭을 넘으면 화면에서는 줄여 그리고, 화면 읽기 프로그램에는 전체를 읽어 준다 */
  nickname: string;
  /** 한 사람 일정의 주인이면 크림색으로 그리고 "○○ 일정"으로 읽어 준다. 함께 일정과 구별하는 표시라 색만으로 두지 않는다 */
  isOwner?: boolean;
  className?: string;
}

/** 연한 네모에 닉네임을 쓴 이름표. 기본은 분홍색 작성자 표시다 */
export const AuthorTag = ({ nickname, isOwner = false, className = "" }: AuthorTagProps): ReactElement => (
  <span
    // 숨긴 글자를 따로 두면 VoiceOver가 "작성자"와 이름을 끊어 읽을 수 있어 한 덩어리로 읽힌다
    role="img"
    aria-label={isOwner ? `${nickname} 일정` : `작성자 ${nickname}`}
    title={nickname}
    className={`inline-block h-[22px] max-w-24 shrink-0 truncate rounded-[4px] px-2 text-[12px] leading-[22px] ${isOwner ? "bg-cream/16 text-cream" : "bg-highlight/16 text-highlight"} ${className}`}
  >
    {nickname}
  </span>
);

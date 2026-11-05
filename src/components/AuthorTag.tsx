import type { ReactElement } from "react";

interface AuthorTagProps {
  /** 작성자 전체 닉네임. 폭을 넘으면 화면에서는 줄여 그리고, 화면 읽기 프로그램에는 전체를 읽어 준다 */
  nickname: string;
  className?: string;
}

/** 연한 분홍 네모에 작성자 닉네임을 쓴 이름표 */
export const AuthorTag = ({ nickname, className = "" }: AuthorTagProps): ReactElement => (
  <span
    // 숨긴 글자를 따로 두면 VoiceOver가 "작성자"와 이름을 끊어 읽을 수 있어 한 덩어리로 읽힌다
    role="img"
    aria-label={`작성자 ${nickname}`}
    title={nickname}
    className={`inline-block h-[22px] max-w-24 shrink-0 truncate rounded-[4px] bg-highlight/16 px-2 text-[12px] leading-[22px] text-highlight ${className}`}
  >
    {nickname}
  </span>
);

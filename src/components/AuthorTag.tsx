import type { ReactElement } from "react";
import { formatEventOwner } from "@/lib/events/calendar";

/**
 * 이름표 종류.
 * - `author`: 누가 적었는지. 분홍색, "작성자 ○○"로 읽는다
 * - `together`: 함께 일정. 분홍색, "함께 일정"으로 읽는다
 * - `owner`: 한 사람 일정의 주인. 크림색, "○○ 일정"으로 읽는다
 */
type AuthorTagVariant = "author" | "together" | "owner";

const ARIA_LABELS: Record<AuthorTagVariant, (text: string) => string> = {
  author: (text) => `작성자 ${text}`,
  // 함께 일정과 한 사람 일정을 색만으로 구별하지 않도록 누구 일정인지 읽어 준다
  together: (text) => `${text} 일정`,
  owner: (text) => `${text} 일정`,
};

interface AuthorTagProps {
  /** 이름표에 쓸 글자(작성자·주인 닉네임, 함께 일정은 "함께"). 폭을 넘으면 화면에서는 줄여 그리고, 화면 읽기 프로그램에는 전체를 읽어 준다 */
  nickname: string;
  /** 이름표 종류(`AuthorTagVariant`). 기본은 작성자 표시 */
  variant?: AuthorTagVariant;
  className?: string;
}

/** 연한 네모에 닉네임을 쓴 이름표. 기본은 분홍색 작성자 표시다 */
export const AuthorTag = ({ nickname, variant = "author", className = "" }: AuthorTagProps): ReactElement => (
  <span
    // 숨긴 글자를 따로 두면 VoiceOver가 "작성자"와 이름을 끊어 읽을 수 있어 한 덩어리로 읽힌다
    role="img"
    aria-label={ARIA_LABELS[variant](nickname)}
    title={nickname}
    className={`inline-block h-[22px] max-w-24 shrink-0 truncate rounded-[4px] px-2 text-[12px] leading-[22px] ${variant === "owner" ? "bg-cream/16 text-cream" : "bg-highlight/16 text-highlight"} ${className}`}
  >
    {nickname}
  </span>
);

interface EventOwnerTagProps {
  isTogether: boolean;
  authorNickname: string | undefined;
}

/**
 * 누구 일정인지 보여 주는 이름표. 함께 일정은 분홍 "함께", 한 사람 일정은 크림색 작성자 닉네임(홈 일정 칸과 같은 규칙).
 * 글자와 종류를 한곳에서 정해, 함께 일정에 닉네임이 붙는 일(#201)이 없게 한다.
 *
 * @example <EventOwnerTag isTogether authorNickname="정운" />
 */
export const EventOwnerTag = ({ isTogether, authorNickname }: EventOwnerTagProps): ReactElement => (
  <AuthorTag nickname={formatEventOwner({ isTogether, authorNickname })} variant={isTogether ? "together" : "owner"} />
);

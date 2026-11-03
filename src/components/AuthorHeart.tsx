import type { ReactElement } from "react";
import { HeartLogo } from "@/components/HeartLogo";
import { toAuthorInitials } from "@/lib/author";

interface AuthorHeartProps {
  /** 작성자 전체 닉네임. 화면에는 2글자로 줄여 그리고, 화면 읽기 프로그램에는 전체를 읽어 준다 */
  nickname: string;
  className?: string;
}

/** 하트 로고 선 안에 작성자 닉네임 2글자를 넣은 작성자 표시 */
export const AuthorHeart = ({ nickname, className = "" }: AuthorHeartProps): ReactElement => (
  <span
    role="img"
    aria-label={`작성자 ${nickname}`}
    title={nickname}
    className={`relative inline-flex size-[38px] shrink-0 items-center justify-center text-label ${className}`}
  >
    <HeartLogo className="absolute inset-0 size-full" strokeWidth={4} />
    {/* 하트는 위쪽이 넓어서 글자를 가운데보다 조금 위에 둔다 */}
    <span aria-hidden="true" className="relative -mt-[3px] text-[10px] leading-none font-medium tracking-[-0.5px] text-ink">
      {toAuthorInitials(nickname)}
    </span>
  </span>
);

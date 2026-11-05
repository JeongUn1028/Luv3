"use client";

import Link from "next/link";
import type { MouseEvent, ReactElement, ReactNode } from "react";
import { goBackInHistory } from "@/lib/navigation/history-back";
import { BACK_TRANSITION } from "@/lib/navigation/transition";

interface BackLinkProps {
  /** 앱 안에 돌아갈 화면이 없을 때(주소로 바로 들어옴, 다른 앱에서 들어옴) 갈 주소 */
  href: string;
  /** 돌아갈 화면이 있어도 정해진 주소로 간다(앞 화면이 이미 없어졌을 때) */
  skipsHistory?: boolean;
  className: string;
  children: ReactNode;
}

/**
 * 머리글의 뒤로 버튼. 앱 안에 이전 화면이 있으면 브라우저 뒤로 가기로 돌아가 숨겨 둔 화면을 그대로 보여 주고, 없으면 정해진 주소로 간다.
 * 어디로 돌아갈지는 눌러 봐야 알 수 있어 이름은 "뒤로"로 둔다.
 *
 * @example <BackLink href="/records" className="size-11"><BackIcon /></BackLink>
 */
export const BackLink = ({ href, skipsHistory = false, className, children }: BackLinkProps): ReactElement => {
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    // 새 탭으로 열기는 브라우저에 맡긴다
    if (skipsHistory || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (goBackInHistory()) event.preventDefault();
  };

  return (
    <Link href={href} transitionTypes={BACK_TRANSITION} aria-label="뒤로" className={className} onClick={handleClick}>
      {children}
    </Link>
  );
};

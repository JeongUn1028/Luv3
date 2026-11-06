import Link from "next/link";
import type { ReactElement, ReactNode } from "react";
import { PageShell } from "@/components/PageShell";
import { BACK_TRANSITION } from "@/lib/navigation/transition";

/** 안내 화면의 "돌아가기" 모양. 문서를 새로 받는 `<a>`도 같은 모양을 쓴다 */
export const STATUS_LINK_CLASS_NAME =
  "press-wide flex h-[51px] w-full items-center justify-center rounded-[10px] border border-line text-[15px] text-ink hover:bg-surface";

interface StatusScreenProps {
  title: string;
  description: string;
  /** 쓰던 화면이 오류로 바뀌는 경우처럼 화면 읽기 프로그램에 바로 알려야 하면 true */
  isAlert?: boolean;
  /** 빠져나갈 버튼·링크 */
  children: ReactNode;
}

/**
 * 오류·찾을 수 없음처럼 내용 대신 보여 주는 안내 화면. 주소창이 없는 홈 화면 앱에서도 빠져나가도록 버튼을 함께 둔다.
 *
 * @example
 * <StatusScreen title="기록을 찾을 수 없어요" description="지워졌거나 주소가 잘못됐어요.">
 *   <StatusLink href={RECORDS_PATH}>기록 목록으로</StatusLink>
 * </StatusScreen>
 */
export const StatusScreen = ({ title, description, isAlert = false, children }: StatusScreenProps): ReactElement => (
  <PageShell className="items-center justify-center gap-4 px-4 text-center">
    <div role={isAlert ? "alert" : undefined} className="flex flex-col gap-4">
      <h1 className="font-display text-[15px] text-ink">{title}</h1>
      <p className="text-[13px] text-ink-sub">{description}</p>
    </div>
    <div className="mt-2 flex w-full flex-col gap-2.5">{children}</div>
  </PageShell>
);

interface StatusLinkProps {
  href: string;
  children: ReactNode;
}

/**
 * 안내 화면에서 다른 화면으로 돌아가는 링크.
 *
 * @example <StatusLink href={HOME_PATH}>홈으로</StatusLink>
 */
export const StatusLink = ({ href, children }: StatusLinkProps): ReactElement => (
  <Link href={href} transitionTypes={BACK_TRANSITION} className={STATUS_LINK_CLASS_NAME}>
    {children}
  </Link>
);

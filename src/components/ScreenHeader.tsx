import Link from "next/link";
import type { ReactElement, ReactNode } from "react";
import { BackIcon } from "@/components/icons";
import { BACK_TRANSITION, FORWARD_TRANSITION } from "@/lib/navigation/transition";

const ICON_BUTTON_CLASS_NAME = "flex size-11 shrink-0 items-center justify-center text-ink-sub hover:text-ink";

interface ScreenHeaderProps {
  /** 왼쪽 뒤로 가기 링크. 없으면 제목이 본문과 같은 왼쪽 여백에서 시작한다 */
  back?: { href: string; label: string };
  /** 화면 제목(h1). 본문에 따로 h1이 있는 화면(기록 상세)은 비운다 */
  title?: string;
  /** true면 제목을 화면에 그리지 않고 스크린 리더에만 읽힌다(홈) */
  isTitleHidden?: boolean;
  /** 제목 바로 뒤에 붙일 것(작성자 하트 등) */
  titleAddon?: ReactNode;
  /** 오른쪽 끝 버튼들(설정, 추가, 수정·삭제 등) */
  actions?: ReactNode;
}

/**
 * 모든 화면 위의 머리글: 뒤로 가기 + 제목 + 오른쪽 버튼. 높이는 버튼 크기(44px)에 맞춘다.
 *
 * @example
 * <ScreenHeader back={{ href: "/", label: "홈으로" }} title="설정" />
 * <ScreenHeader title="기록" actions={<ScreenHeaderLink href="/dates/new" label="기록 남기기">…</ScreenHeaderLink>} />
 */
export const ScreenHeader = ({ back, title, isTitleHidden = false, titleAddon, actions }: ScreenHeaderProps): ReactElement => (
  // relative: 숨긴 제목(sr-only)이 문서가 아닌 머리글 안에 놓이게 한다
  <header className="relative flex min-h-11 shrink-0 items-center justify-between px-2">
    <div className="flex min-w-0 items-center">
      {back && (
        <Link href={back.href} transitionTypes={BACK_TRANSITION} aria-label={back.label} className={ICON_BUTTON_CLASS_NAME}>
          <BackIcon className="size-[22px]" />
        </Link>
      )}
      {title && (
        <h1 className={isTitleHidden ? "sr-only" : `truncate text-[17px] text-ink ${back ? "" : "px-2"}`}>{title}</h1>
      )}
      {titleAddon}
    </div>
    {actions && <div className="flex shrink-0 items-center">{actions}</div>}
  </header>
);

interface ScreenHeaderLinkProps {
  href: string;
  /** 아이콘만 보이므로 스크린 리더가 읽을 이름 */
  label: string;
  children: ReactNode;
}

/**
 * 머리글 오른쪽의 아이콘 링크(설정, 추가).
 *
 * @example <ScreenHeaderLink href="/settings" label="설정"><SettingsIcon className="size-[22px]" /></ScreenHeaderLink>
 */
export const ScreenHeaderLink = ({ href, label, children }: ScreenHeaderLinkProps): ReactElement => (
  <Link href={href} transitionTypes={FORWARD_TRANSITION} aria-label={label} className={ICON_BUTTON_CLASS_NAME}>
    {children}
  </Link>
);

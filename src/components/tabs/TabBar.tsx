"use client";

import Link from "next/link";
import type { MouseEvent, ReactElement } from "react";
import { CalendarIcon, GridIcon, HomeIcon, TodoIcon } from "@/components/icons";
import { HOME_PATH } from "@/lib/auth/paths";
import { CALENDAR_PATH } from "@/lib/calendar/month";
import { RECORDS_PATH } from "@/lib/dates/album";
import { scrollAreaToTop } from "@/lib/navigation/scroll-memory";
import { TAB_TRANSITION } from "@/lib/navigation/transition";
import { TODOS_PATH } from "@/lib/todos/list";

/** 하단 탭 순서(왼쪽 → 오른쪽). 탭마다 주소가 따로 있다 */
const MAIN_TABS = [
  { tab: "home", href: HOME_PATH, label: "홈", Icon: HomeIcon },
  { tab: "records", href: RECORDS_PATH, label: "기록", Icon: GridIcon },
  { tab: "calendar", href: CALENDAR_PATH, label: "캘린더", Icon: CalendarIcon },
  { tab: "todos", href: TODOS_PATH, label: "Todo", Icon: TodoIcon },
] as const;

export type MainTab = (typeof MAIN_TABS)[number]["tab"];

interface TabBarProps {
  /** 지금 보고 있는 탭 */
  current: MainTab;
}

/** 지금 탭을 다시 누르면 맨 위로 올린다. 다른 달을 보던 캘린더처럼 주소가 다르면 이동도 그대로 한다 */
const handleCurrentTabClick = (event: MouseEvent<HTMLAnchorElement>, tab: MainTab, href: string) => {
  // 새 탭으로 열기는 브라우저에 맡긴다
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  scrollAreaToTop(tab);
  if (`${window.location.pathname}${window.location.search}` === href) event.preventDefault();
};

/**
 * 하단 탭 4개. 탭은 화면 이동 링크라 tablist가 아닌 nav로 두고, 지금 화면은 `aria-current`로 알린다.
 * fixed를 쓰지 않고 화면 틀(PageShell) 맨 아래에 놓이며, 아래 safe-area(홈 인디케이터)만큼 스스로 띄운다.
 *
 * @example <TabBar current="records" />
 */
export const TabBar = ({ current }: TabBarProps): ReactElement => (
  // 탭을 길게 눌러도 글자 선택·링크 미리보기가 뜨지 않게 한다
  <nav
    aria-label="주요 화면"
    className="shrink-0 border-t border-line bg-tabbar pb-[max(8px,env(safe-area-inset-bottom))] select-none [-webkit-touch-callout:none]"
  >
    <ul className="flex h-[52px]">
      {MAIN_TABS.map(({ tab, href, label, Icon }) => {
        const isCurrent = tab === current;
        return (
          <li key={tab} className="flex flex-1">
            <Link
              href={href}
              transitionTypes={TAB_TRANSITION}
              aria-current={isCurrent ? "page" : undefined}
              onClick={isCurrent ? (event) => handleCurrentTabClick(event, tab, href) : undefined}
              className={`flex flex-1 flex-col items-center justify-center gap-1 font-display text-[11px] ${isCurrent ? "text-highlight" : "text-ink-sub"}`}
            >
              <Icon className="size-[22px]" />
              {label}
            </Link>
          </li>
        );
      })}
    </ul>
  </nav>
);

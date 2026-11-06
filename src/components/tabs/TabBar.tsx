"use client";

import Link from "next/link";
import { useLayoutEffect, useRef, type MouseEvent, type ReactElement } from "react";
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

/** 탭 표시를 지우기까지의 시간(ms). 첫 화면이 늦게 그려져도 움직임이 잘리지 않게 globals.css의 움직임보다 넉넉히 둔다 */
const TAB_MOTION_CLEAR_MS = 1000;

// 탭 줄은 화면마다 따로 있어, 누른 탭 줄과 나타날 탭 줄이 다르다. 뒤로 돌아올 때나 처음 켤 때 튕기지 않도록 누른 탭을 여기 적어 둔다
let pendingTabChange: { from: MainTab; to: MainTab } | undefined;

const getTabLink = (nav: HTMLElement | null, tab: MainTab): HTMLElement | null | undefined => nav?.querySelector<HTMLElement>(`[data-tab="${tab}"]`);

/** 탭을 골라 이 탭 줄이 나타났을 때만 고른 탭과 떠난 탭을 잠깐 표시한다 */
const useTabChangeMotion = (current: MainTab) => {
  const navRef = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    const change = pendingTabChange;
    pendingTabChange = undefined;
    if (change?.to !== current) return;

    const entering = getTabLink(navRef.current, change.to);
    const leaving = getTabLink(navRef.current, change.from);
    entering?.setAttribute("data-tab-motion", "in");
    leaving?.setAttribute("data-tab-motion", "out");
    // 남겨 두면 숨겨졌던 화면이 다시 보일 때 움직임이 또 돈다
    const clear = () => {
      entering?.removeAttribute("data-tab-motion");
      leaving?.removeAttribute("data-tab-motion");
    };
    const timer = setTimeout(clear, TAB_MOTION_CLEAR_MS);
    return () => {
      clearTimeout(timer);
      clear();
    };
  }, [current]);

  return navRef;
};

interface TabBarProps {
  /** 지금 보고 있는 탭 */
  current: MainTab;
}

/** 지금 탭을 다시 누르면 맨 위로 올린다. 다른 달을 보던 캘린더처럼 주소가 다르면 이동도 그대로 한다 */
const handleCurrentTabClick = (event: MouseEvent<HTMLAnchorElement>, tab: MainTab, href: string) => {
  scrollAreaToTop(tab);
  if (`${window.location.pathname}${window.location.search}` === href) event.preventDefault();
};

/**
 * 하단 탭 4개. 탭은 화면 이동 링크라 tablist가 아닌 nav로 두고, 지금 화면은 `aria-current`로 알린다.
 * fixed를 쓰지 않고 화면 틀(PageShell) 맨 아래에 놓이며, 아래 safe-area(홈 인디케이터)만큼 스스로 띄운다.
 *
 * @example <TabBar current="records" />
 */
export const TabBar = ({ current }: TabBarProps): ReactElement => {
  const navRef = useTabChangeMotion(current);

  return (
    // 탭을 길게 눌러도 글자 선택·링크 미리보기가 뜨지 않게 한다
    <nav
      ref={navRef}
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
                data-tab={tab}
                onClick={(event) => {
                  // 새 탭으로 열기는 브라우저에 맡긴다. 이 화면은 그대로이므로 고른 탭으로 치지 않는다
                  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                  if (isCurrent) handleCurrentTabClick(event, tab, href);
                  else pendingTabChange = { from: current, to: tab };
                }}
                className={`tab-link flex flex-1 flex-col items-center justify-center gap-1 font-display text-[11px] ${isCurrent ? "text-highlight" : "text-ink-sub"}`}
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
};

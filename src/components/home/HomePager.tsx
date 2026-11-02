"use client";

import { useLayoutEffect, useRef, type KeyboardEvent, type ReactElement, type ReactNode, type UIEvent } from "react";
import { useSearchParams } from "next/navigation";
import { CalendarIcon, GridIcon } from "@/components/icons";
import {
  HOME_VIEWS,
  HOME_VIEW_PARAM,
  buildHomeViewSearch,
  getViewFromScroll,
  parseHomeView,
  type HomeView,
} from "@/lib/home/view";

interface HomePagerProps {
  records: ReactNode;
  calendar: ReactNode;
}

const TABS = [
  { view: "records", label: "기록", Icon: GridIcon },
  { view: "calendar", label: "캘린더", Icon: CalendarIcon },
] as const;

const tabId = (view: HomeView): string => `home-tab-${view}`;
const panelId = (view: HomeView): string => `home-panel-${view}`;

const prefersReducedMotion = (): boolean => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * 기록(왼쪽)과 캘린더(오른쪽)를 옆으로 넘기거나 하단 탭으로 오가는 홈 화면 틀.
 * 스와이프만으로는 옆 페이지가 있는지 알기 어렵고 스크린 리더로 넘길 수 없어 탭을 함께 둔다.
 * 현재 페이지는 상태로 따로 두지 않고 URL(`?view=`)에서 바로 계산한다. replaceState는 useSearchParams와 연동되고,
 * cacheComponents의 Activity가 다른 화면에 다녀와도 이 컴포넌트를 지우지 않고 숨겨 두므로, 따로 둔 상태는 URL과 어긋난다.
 */
export const HomePager = ({ records, calendar }: HomePagerProps): ReactElement => {
  const view = parseHomeView(useSearchParams().get(HOME_VIEW_PARAM));
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const tabRefs = useRef<Partial<Record<HomeView, HTMLButtonElement | null>>>({});
  // 탭으로 옮기는 중 지나가는 스크롤 위치로 페이지가 되돌아가지 않게, 도착할 때까지 스크롤 판단을 멈춘다
  const pendingLeftRef = useRef<number | undefined>(undefined);
  const pendingTimerRef = useRef<number | undefined>(undefined);

  const changeView = (next: HomeView) => {
    const { pathname, search, hash } = window.location;
    window.history.replaceState(null, "", `${pathname}${buildHomeViewSearch(next, search)}${hash}`);
  };

  const scrollToView = (next: HomeView, behavior: ScrollBehavior) => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const left = HOME_VIEWS.indexOf(next) * scroller.clientWidth;
    if (Math.abs(scroller.scrollLeft - left) < 1) return;
    pendingLeftRef.current = left;
    window.clearTimeout(pendingTimerRef.current);
    // 도착 판정을 놓쳐도(사용자가 중간에 밀어 멈춤 등) 스와이프 판단이 계속 멈춰 있지 않게 한다
    pendingTimerRef.current = window.setTimeout(() => {
      pendingLeftRef.current = undefined;
    }, 1000);
    scroller.scrollTo({ left, behavior });
  };

  // 스크롤 위치가 URL의 페이지와 다르면 화면에 그리기 전에 맞춘다: 처음 열 때(서버 HTML은 항상 왼쪽에서 시작),
  // 숨겨졌던 홈이 다시 보일 때(Activity가 레이아웃 이펙트를 다시 실행), 다른 주소로 홈에 돌아왔을 때.
  // 스와이프 중에는 URL이 스크롤 위치에서 나오므로 서로 같아 건드리지 않는다.
  useLayoutEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller || scroller.clientWidth === 0 || pendingLeftRef.current !== undefined) return;
    if (getViewFromScroll(scroller.scrollLeft, scroller.clientWidth) !== view) {
      scroller.scrollLeft = HOME_VIEWS.indexOf(view) * scroller.clientWidth;
    }
  }, [view]);

  const handleScroll = (event: UIEvent<HTMLDivElement>) => {
    const { scrollLeft, clientWidth } = event.currentTarget;
    if (pendingLeftRef.current !== undefined) {
      if (Math.abs(scrollLeft - pendingLeftRef.current) < 1) pendingLeftRef.current = undefined;
      return;
    }
    const visible = getViewFromScroll(scrollLeft, clientWidth);
    if (visible !== view) changeView(visible);
  };

  const handleSelect = (next: HomeView) => {
    scrollToView(next, prefersReducedMotion() ? "instant" : "smooth");
    if (next !== view) changeView(next);
  };

  // 탭 목록 키보드 규칙(WAI-ARIA Tabs): 좌우 화살표로 옆 탭으로 옮기고 바로 선택한다
  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    const offset = event.key === "ArrowRight" ? 1 : -1;
    const index = (HOME_VIEWS.indexOf(view) + offset + HOME_VIEWS.length) % HOME_VIEWS.length;
    const next = HOME_VIEWS[index];
    handleSelect(next);
    tabRefs.current[next]?.focus();
  };

  const panels: Record<HomeView, ReactNode> = { records, calendar };

  return (
    <>
      <div
        ref={scrollerRef}
        onScroll={handleScroll}
        className="flex min-h-0 flex-1 snap-x snap-mandatory overflow-x-auto overflow-y-hidden overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {HOME_VIEWS.map((panelView) => (
          <section
            key={panelView}
            id={panelId(panelView)}
            role="tabpanel"
            aria-labelledby={tabId(panelView)}
            // 옆 페이지의 링크·버튼에 초점이 가거나 스크린 리더가 읽지 않게 한다
            inert={panelView !== view}
            className="h-full w-full shrink-0 snap-start snap-always overflow-y-auto overscroll-y-contain"
          >
            {panels[panelView]}
          </section>
        ))}
      </div>
      <div className="shrink-0 border-t border-line bg-tabbar pb-[max(8px,env(safe-area-inset-bottom))]">
        <div role="tablist" aria-label="홈 페이지" className="flex h-[52px]">
          {TABS.map(({ view: tabView, label, Icon }) => {
            const isSelected = tabView === view;
            return (
              <button
                key={tabView}
                ref={(button) => {
                  tabRefs.current[tabView] = button;
                }}
                id={tabId(tabView)}
                type="button"
                role="tab"
                aria-selected={isSelected}
                aria-controls={panelId(tabView)}
                tabIndex={isSelected ? 0 : -1}
                onClick={() => handleSelect(tabView)}
                onKeyDown={handleTabKeyDown}
                className={`flex flex-1 flex-col items-center justify-center gap-1 text-[11px] ${isSelected ? "text-cream" : "text-ink-sub"}`}
              >
                <Icon className="size-[22px]" />
                {label}
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
};

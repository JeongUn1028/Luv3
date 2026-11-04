import { ViewTransition, type ReactElement, type ReactNode } from "react";
import { ScrollArea } from "@/components/ScrollArea";
import { SCREEN_MOTION, SLIDE_MOTION } from "@/lib/navigation/transition";

/** 스크롤 영역 맨 아래 여백. 홈 인디케이터(safe-area) 높이보다 작아지지 않는다. */
const BOTTOM_SPACE = {
  safe: "pb-[env(safe-area-inset-bottom)]",
  sm: "pb-[max(24px,env(safe-area-inset-bottom))]",
  md: "pb-[max(32px,env(safe-area-inset-bottom))]",
  lg: "pb-[max(44px,env(safe-area-inset-bottom))]",
} as const;

type BottomSpace = keyof typeof BOTTOM_SPACE;

interface PageShellBaseProps {
  children: ReactNode;
  /** 스크롤해도 위에 남는 머리글. 위 safe-area 여백은 틀이 붙인다. 없으면 내용 맨 위에 여백을 둔다 */
  header?: ReactNode;
  /** 내용 영역에 더할 클래스(좌우 여백, 가운데 정렬 등) */
  className?: string;
  /** 스크롤 위치를 기억할 화면 이름. 없으면 화면을 열 때마다 맨 위에서 시작한다 */
  scrollKey?: string;
}

/** 하단 탭이 있으면 아래 safe-area를 하단 탭이 채우므로 내용 아래 여백은 고를 수 없다 */
type PageShellProps = PageShellBaseProps &
  (
    | {
        /** 스크롤 영역 아래에 붙는 하단 탭. 아래 safe-area 여백은 이 요소가 스스로 채운다 */
        footer: ReactNode;
        bottomSpace?: never;
      }
    | {
        footer?: undefined;
        /** 내용 아래 여백(기본 `safe`) */
        bottomSpace?: BottomSpace;
      }
  );

/**
 * 모든 화면의 공통 틀. 화면 높이 틀(루트 레이아웃)을 머리글·내용과 하단 탭으로 채우고, 문서 대신 머리글 아래 내용 영역만 스크롤한다.
 * 화면 제목이 본문 영역 안에 남도록 머리글도 main 안에 둔다. 하단 탭은 fixed 대신 스크롤 영역 아래에 둔다.
 * 홈 화면 앱을 처음 띄우면 iOS가 뷰포트·fixed를 상태바만큼 작게 잡아서(#51), 문서 스크롤과 fixed에 기대지 않는다.
 * 화면을 옮길 때 머리글·내용과 하단 탭을 따로 움직여, 탭끼리 옮길 때 하단 탭이 깜빡이지 않는다(#53).
 *
 * @example
 * <PageShell header={<ScreenHeader title="설정" />} bottomSpace="sm" className="px-4">
 *   <form>…</form>
 * </PageShell>
 */
export const PageShell = ({ children, header, footer, bottomSpace = "safe", className = "", scrollKey }: PageShellProps): ReactElement => (
  // ViewTransition 바깥에 DOM 요소를 두면 React가 화면이 들어오고 나가는 움직임을 돌리지 않는다. 그래서 높이 틀은 루트 레이아웃에 둔다
  <>
    <ViewTransition enter={SCREEN_MOTION} exit={SCREEN_MOTION} default="none">
      <main className="flex min-h-0 flex-1 flex-col">
        {header && <div className="shrink-0 pt-[env(safe-area-inset-top)]">{header}</div>}
        <ScrollArea
          scrollKey={scrollKey}
          className={[
            // min-h-0이 없으면 내용 영역이 내용만큼 늘어나 안쪽 스크롤이 생기지 않는다.
            // relative: sr-only 같은 absolute 자식이 문서가 아닌 스크롤 영역 안에 놓이게 한다
            "relative flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto overscroll-contain",
            header ? "" : "pt-[env(safe-area-inset-top)]",
            footer ? "" : BOTTOM_SPACE[bottomSpace],
            className,
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {children}
        </ScrollArea>
      </main>
    </ViewTransition>
    {footer && (
      <ViewTransition enter={SLIDE_MOTION} exit={SLIDE_MOTION} default="none">
        {footer}
      </ViewTransition>
    )}
  </>
);

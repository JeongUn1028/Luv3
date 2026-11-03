import type { ReactElement, ReactNode } from "react";

/**
 * 스크롤 영역 맨 아래 여백. `flush` 말고는 홈 인디케이터(safe-area) 높이보다 작아지지 않는다.
 * `flush`는 하단 탭처럼 안쪽 요소가 아래 safe-area를 스스로 채우는 화면에만 쓴다.
 */
const BOTTOM_SPACE = {
  flush: "",
  safe: "pb-[env(safe-area-inset-bottom)]",
  sm: "pb-[max(24px,env(safe-area-inset-bottom))]",
  md: "pb-[max(32px,env(safe-area-inset-bottom))]",
  lg: "pb-[max(44px,env(safe-area-inset-bottom))]",
} as const;

type BottomSpace = keyof typeof BOTTOM_SPACE;

interface PageShellProps {
  children: ReactNode;
  /** 스크롤해도 위에 남는 머리글. 위 safe-area 여백은 틀이 붙인다. 없으면 내용 맨 위에 여백을 둔다 */
  header?: ReactNode;
  /** 내용 아래 여백(기본 `safe`). 하단 탭이 아래 여백을 스스로 정하는 홈은 `flush`와 `isScrollable={false}`를 함께 쓴다 */
  bottomSpace?: BottomSpace;
  /** false면 내용 영역은 높이만 채우고 스크롤은 안쪽 요소(예: 홈의 좌우 넘김)가 맡는다 */
  isScrollable?: boolean;
  /** 내용 영역에 더할 클래스(좌우 여백, 가운데 정렬 등) */
  className?: string;
}

/**
 * 모든 화면의 공통 틀. 화면 높이(`h-app`)로 고정하고 문서 대신 머리글 아래 내용 영역만 스크롤한다.
 * 화면 제목이 본문 영역 안에 남도록 머리글도 main 안에 둔다.
 * 홈 화면 앱을 처음 띄우면 iOS가 뷰포트·fixed를 상태바만큼 작게 잡아서(#51), 문서 스크롤과 fixed에 기대지 않는다.
 *
 * @example
 * <PageShell header={<header>…</header>} bottomSpace="sm" className="px-4">
 *   <form>…</form>
 * </PageShell>
 */
export const PageShell = ({
  children,
  header,
  bottomSpace = "safe",
  isScrollable = true,
  className = "",
}: PageShellProps): ReactElement => (
  <main className="mx-auto flex h-app w-full max-w-[430px] flex-col">
    {header && <div className="shrink-0 pt-[env(safe-area-inset-top)]">{header}</div>}
    <div
      className={[
        // min-h-0이 없으면 내용 영역이 내용만큼 늘어나 안쪽 스크롤이 생기지 않는다
        "flex min-h-0 flex-1 flex-col",
        // relative: sr-only 같은 absolute 자식이 문서가 아닌 스크롤 영역 안에 놓이게 한다
        isScrollable ? "relative overflow-y-auto overscroll-contain" : "",
        header ? "" : "pt-[env(safe-area-inset-top)]",
        BOTTOM_SPACE[bottomSpace],
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </div>
  </main>
);

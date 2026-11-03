import type { ReactElement, ReactNode } from "react";
import { PageShell } from "@/components/PageShell";
import { ScreenHeader } from "@/components/ScreenHeader";
import { TabBar, type MainTab } from "@/components/tabs/TabBar";

interface TabScreenProps {
  /** 하단 탭에서 켤 탭 */
  tab: MainTab;
  /** 화면 제목(h1) */
  title: string;
  /** true면 제목을 스크린 리더에만 읽힌다(홈) */
  isTitleHidden?: boolean;
  /** 머리글 오른쪽 버튼(설정, 추가) */
  actions?: ReactNode;
  /** 내용 영역에 더할 클래스 */
  className?: string;
  children: ReactNode;
}

/**
 * 하단 탭 화면(홈·기록·캘린더·Todo)의 공통 틀: 머리글 + 스크롤되는 내용 + 하단 탭.
 * 탭마다 스크롤 영역이 따로 있어, 탭을 옮겨도 다른 탭의 스크롤 위치가 섞이지 않는다.
 *
 * @example
 * <TabScreen tab="records" title="기록" actions={<ScreenHeaderLink href="/dates/new" label="기록 남기기">…</ScreenHeaderLink>}>
 *   <AlbumGrid tiles={tiles} />
 * </TabScreen>
 */
export const TabScreen = ({ tab, title, isTitleHidden, actions, className, children }: TabScreenProps): ReactElement => (
  <PageShell
    header={<ScreenHeader title={title} isTitleHidden={isTitleHidden} actions={actions} />}
    footer={<TabBar current={tab} />}
    className={className}
  >
    {children}
  </PageShell>
);

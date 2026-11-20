import type { KeyboardEvent, ReactElement, ReactNode } from "react";
import { toKeyboardTab, TODO_TABS, type TodoTab } from "@/lib/todos/list-view";

/** 탭 하나에 그리는 것 */
export interface TodoTabPanel {
  /** 탭 이름(예: "아직"). 목록 이름으로도 써서 구역 모양과 같은 이름으로 찾는다 */
  label: string;
  count: number;
  /** 목록 위 줄 왼쪽의 짧은 안내(예: "날짜순") */
  hint?: string;
  /** 목록 위 줄 오른쪽 버튼(순서 바꾸기) */
  action?: ReactNode;
  /** 항목이 없을 때의 문구 */
  emptyText: string;
  items: ReactNode;
}

interface TodoTabsProps {
  activeTab: TodoTab;
  onSelect: (tab: TodoTab) => void;
  panels: Readonly<Record<TodoTab, TodoTabPanel>>;
}

/** 탭 버튼 id. 목록이 체크한 항목이 다른 탭으로 옮겨 가면 초점을 이 버튼으로 돌린다 */
export const toTodoTabId = (tab: TodoTab): string => `todo-tab-${tab}`;

const toPanelId = (tab: TodoTab): string => `todo-tab-panel-${tab}`;

/**
 * 하고 싶은 것 목록의 탭 모양(#497, 설정 '목록 보기 > 탭으로'). 위에 '일정 잡힌 것 / 아직 / 완료' 탭을 두고 고른 탭의 목록만 그린다.
 * 키보드로는 방향키·Home·End로 탭을 옮기고(옮기면 바로 그 탭을 연다), Tab 키로 목록에 들어간다.
 *
 * @example <TodoTabs activeTab="unscheduled" onSelect={setActiveTab} panels={panels} />
 */
export const TodoTabs = ({ activeTab, onSelect, panels }: TodoTabsProps): ReactElement => {
  const panel = panels[activeTab];

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const next = toKeyboardTab(activeTab, event.key);
    if (!next) return;
    event.preventDefault();
    onSelect(next);
    document.getElementById(toTodoTabId(next))?.focus();
  };

  return (
    <div className="flex flex-col">
      <div role="tablist" aria-label="하고 싶은 것 나눠 보기" onKeyDown={handleKeyDown} className="flex rounded-[10px] bg-surface p-[3px]">
        {TODO_TABS.map((tab) => {
          const isActive = tab === activeTab;
          return (
            <button
              key={tab}
              id={toTodoTabId(tab)}
              type="button"
              role="tab"
              aria-selected={isActive}
              // 고른 탭의 내용만 그리므로 있는 내용만 가리킨다
              aria-controls={isActive ? toPanelId(tab) : undefined}
              // 고른 탭만 Tab 키로 들어온다. 나머지는 방향키로 옮긴다
              tabIndex={isActive ? 0 : -1}
              onClick={() => onSelect(tab)}
              className={`flex min-h-11 flex-1 items-center justify-center rounded-[8px] px-1 text-[14px] tabular-nums ${isActive ? "bg-line text-ink" : "text-ink-sub"}`}
            >
              {`${panels[tab].label} ${panels[tab].count}`}
            </button>
          );
        })}
      </div>
      <div role="tabpanel" id={toPanelId(activeTab)} aria-labelledby={toTodoTabId(activeTab)}>
        {/* 줄 높이를 버튼 크기(44px)로 두어 탭마다 버튼이 있든 없든 목록이 같은 자리에서 시작한다 */}
        <div className="flex min-h-11 items-center justify-between gap-2">
          <span className="text-[13px] text-ink-sub">{panel.hint}</span>
          {panel.action}
        </div>
        {panel.count === 0 ? (
          <p className="py-10 text-center text-[13px] text-ink-sub">{panel.emptyText}</p>
        ) : (
          <ul aria-label={panel.label} className="flex flex-col">
            {panel.items}
          </ul>
        )}
      </div>
    </div>
  );
};

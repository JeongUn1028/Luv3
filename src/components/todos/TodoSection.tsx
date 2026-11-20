import type { ReactElement, ReactNode } from "react";

interface TodoReorderToggleProps {
  isReordering: boolean;
  onToggle: () => void;
}

/**
 * '아직' 구역 제목 줄의 '순서 바꾸기 / 끝'(#497). 같은 버튼의 글자만 바꿔 누른 뒤에도 초점이 그대로 남는다.
 *
 * @example <TodoReorderToggle isReordering={false} onToggle={handleToggleReorder} />
 */
export const TodoReorderToggle = ({ isReordering, onToggle }: TodoReorderToggleProps): ReactElement => (
  <button type="button" onClick={onToggle} className="press-icon -mr-2 flex h-11 shrink-0 items-center px-2 text-[13px]">
    {isReordering ? (
      <span className="rounded-full bg-accent px-3 py-1 font-display text-background">끝</span>
    ) : (
      <span className="text-accent">순서 바꾸기</span>
    )}
  </button>
);

interface TodoSectionProps {
  /** 제목(h2) id. 구역 이름으로 읽힌다 */
  titleId: string;
  /** 구역 제목. 개수를 붙여 보여 준다(예: "아직 4") */
  title: string;
  /** 목록 이름. 개수가 바뀌어도 같은 이름으로 찾을 수 있게 제목과 따로 둔다 */
  listLabel: string;
  /** 제목 줄 오른쪽 버튼(순서 바꾸기) */
  action?: ReactNode;
  /** 순서 바꾸기 편집 중인 다른 구역이면 흐리게 하고 누를 수 없게 한다(#497) */
  isInert?: boolean;
  children: ReactNode;
}

/**
 * 하고 싶은 것 목록의 한 구역: 제목 줄 + 목록(#497). 제목 줄 높이는 버튼 크기(44px)로 같아 버튼이 있든 없든 줄이 튀지 않는다.
 *
 * @example <TodoSection titleId="todos-done" title="완료 2" listLabel="완료">{items}</TodoSection>
 */
export const TodoSection = ({ titleId, title, listLabel, action, isInert = false, children }: TodoSectionProps): ReactElement => (
  <section aria-labelledby={titleId} inert={isInert} className={`transition-opacity duration-200 ${isInert ? "opacity-40" : ""}`}>
    <div className="flex min-h-11 items-center justify-between gap-2">
      <h2 id={titleId} className="text-[13px] text-ink-sub">
        {title}
      </h2>
      {action}
    </div>
    <ul aria-label={listLabel} className="flex flex-col">
      {children}
    </ul>
  </section>
);

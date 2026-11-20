"use client";

import { useState, type ReactElement } from "react";
import { markAllScreensStale } from "@/lib/navigation/screen-freshness";
import { useResetOnHide } from "@/lib/navigation/use-reset-on-hide";
import { withLoadedClient } from "@/lib/supabase/load-client";
import { TODO_LIST_VIEW_OPTIONS, type TodoListView } from "@/lib/todos/list-view";

const SAVE_FAILED_MESSAGE = "목록 보기를 바꾸지 못했어요. 잠시 후 다시 시도해 주세요.";

interface TodoListViewSettingProps {
  /** 서버에서 읽은 지금 목록 보기. 누르면 바로 바꿔 그리고, 저장에 실패하면 되돌린다 */
  initialView: TodoListView;
}

/**
 * 설정 화면 '하고 싶은 것 > 목록 보기 [구역으로 | 탭으로]'(#497). 고르면 바로 저장하고, 하고 싶은 것 탭을 다시 열면 그 모양으로 보인다.
 * 사람마다 하나라 이 사람의 모든 기기에 적용되고 상대 화면은 그대로다.
 * 두 칸 가운데 하나를 고르는 것이라 라디오 버튼으로 두어 방향키로도 바꿀 수 있다.
 *
 * @example <TodoListViewSetting initialView={member.todoListView} />
 */
export const TodoListViewSetting = ({ initialView }: TodoListViewSettingProps): ReactElement => {
  // 서버 값을 처음 값으로만 쓰고, 고른 값은 저장 성공 전까지 먼저 그린다
  const [view, setView] = useState(initialView);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>();
  useResetOnHide(() => setErrorMessage(undefined));

  const handleChange = async (nextView: TodoListView) => {
    // 저장 중에 또 바꾸면 늦게 끝난 저장이 먼저 고른 값으로 덮을 수 있어, 끝날 때까지 받지 않는다
    if (isSaving || nextView === view) return;
    const previousView = view;
    setView(nextView);
    setIsSaving(true);
    setErrorMessage(undefined);
    // 라이브러리를 받거나 요청하다 던져도 실패로 보고 되돌린다. 그러지 않으면 저장 중인 채 남아 다시 바꿀 수 없다
    const error = await withLoadedClient<unknown>({
      request: async (supabase) => (await supabase.rpc("set_todo_list_view", { p_view: nextView })).error ?? undefined,
      onLoadFailed: () => new Error("Supabase 라이브러리를 받지 못했습니다."),
    }).catch((thrown: unknown) => thrown ?? new Error("목록 보기 저장이 멈췄습니다."));
    setIsSaving(false);
    if (!error) {
      // 받아 둔 하고 싶은 것 화면은 예전 모양이라, 다시 열 때 새로 받게 한다
      markAllScreensStale();
      return;
    }
    console.error(new Error("목록 보기를 바꾸지 못했습니다.", { cause: error }));
    setView(previousView);
    setErrorMessage(SAVE_FAILED_MESSAGE);
  };

  return (
    <>
      <div className="mt-2 flex flex-col gap-3 rounded-[10px] bg-surface px-4 py-3">
        <span id="todo-list-view-label" className="text-[15px] text-ink">
          목록 보기
        </span>
        <div
          role="radiogroup"
          aria-labelledby="todo-list-view-label"
          aria-describedby="todo-list-view-help"
          aria-busy={isSaving}
          // 저장 중에는 바꾸지 않으므로 방향키로 초점만 옮겨 가 고른 칸과 초점이 어긋나지 않게 한다
          onKeyDown={(event) => {
            if (isSaving && event.key.startsWith("Arrow")) event.preventDefault();
          }}
          className="flex rounded-[10px] bg-background p-[3px]">
          {TODO_LIST_VIEW_OPTIONS.map(({ view: option, label }) => (
            // 투명한 라디오를 칸 전체에 덮어 어디를 눌러도 고르고, 키보드 초점은 칸 테두리로 보인다
            <label key={option} className="relative flex min-h-11 flex-1 cursor-pointer items-center justify-center">
              <input
                type="radio"
                name="todo-list-view"
                value={option}
                checked={view === option}
                onChange={() => handleChange(option)}
                className="peer absolute inset-0 m-0 size-full cursor-pointer appearance-none rounded-[8px] opacity-0"
              />
              <span className="pointer-events-none flex size-full items-center justify-center rounded-[8px] text-[14px] text-ink-sub peer-checked:bg-line peer-checked:text-ink peer-focus-visible:outline-2 peer-focus-visible:outline-accent"
              >
                {label}
              </span>
            </label>
          ))}
        </div>
        <p id="todo-list-view-help" className="text-[12px] text-ink-sub">
          구역: 한 목록에 나눠서 · 탭: 일정 잡힌 것 / 아직 / 완료
        </p>
      </div>
      {errorMessage && (
        <p role="alert" className="mt-3 text-[13px] text-accent">
          {errorMessage}
        </p>
      )}
    </>
  );
};

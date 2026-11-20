import type { LinkedTodo } from "@/lib/events/form";
import { isUuid } from "@/lib/guards";
import { TODOS_PATH } from "./list";

/**
 * 하고 싶은 것 고치기 화면 주소. 일정 폼이 하고 싶은 것에서 열렸을 때 돌아갈 곳이다.
 *
 * @example toTodoEditHref("t1") // "/todos/t1/edit"
 */
export const toTodoEditHref = (todoId: string): string => `${TODOS_PATH}/${encodeURIComponent(todoId)}/edit`;

/**
 * 하고 싶은 것에 일정을 잡는 새 일정 폼 주소(#471). 폼이 제목·"함께"를 채우고, 저장할 때 일정을 그 하고 싶은 것에 잇는다.
 *
 * @example toScheduleTodoHref("t1") // "/events/new?todo=t1"
 */
export const toScheduleTodoHref = (todoId: string): string => `/events/new?${new URLSearchParams({ todo: todoId }).toString()}`;

/** 하고 싶은 것 목록에서 여러 개를 골라 연 새 일정 폼의 주소 쿼리 이름(#495). 하고 싶은 것 고치기 화면에서 연 `todo`와 돌아갈 곳·폼 모양이 달라 따로 둔다 */
export const PICKED_TODOS_PARAM = "pick";

/**
 * 하고 싶은 것 목록에서 고른 것으로 일정을 잡는 새 일정 폼 주소(#495). 폼은 고른 것을 미리 이어 둔 채 열린다.
 *
 * @example toPickedTodosScheduleHref(["a", "b"]) // "/events/new?pick=a&pick=b"
 */
export const toPickedTodosScheduleHref = (todoIds: readonly string[]): string =>
  `/events/new?${new URLSearchParams(todoIds.map((id) => [PICKED_TODOS_PARAM, id])).toString()}`;

/**
 * 주소 쿼리의 고른 하고 싶은 것 id를 읽는다. id 형식이 아닌 것은 빼고, 같은 id는 하나만 남긴다.
 *
 * @example parsePickedTodoIds((await searchParams).pick) // ["a", "b"]
 */
export const parsePickedTodoIds = (value: string | string[] | undefined): string[] => {
  const values = typeof value === "string" ? [value] : (value ?? []);
  return [...new Set(values.filter(isUuid))];
};

/**
 * 고른 하고 싶은 것 중 지금 이을 수 있는 것(아직 일정이 없고 완료하지 않은 것)만 목록 순서대로 고른다.
 * 누른 순서가 아니라 목록 순서라, 첫 번째(새 일정 제목)는 저장 뒤 홈 '첫 번째 외 N개'와 같다.
 *
 * @example pickLinkableTodos(await getLinkableTodosByIds(ids), ids) // { picked: [...], missingCount: 0 }
 */
export const pickLinkableTodos = (linkable: readonly LinkedTodo[], todoIds: readonly string[]): { picked: LinkedTodo[]; missingCount: number } => {
  const pickedIds = new Set(todoIds);
  const picked = linkable.filter(({ id }) => pickedIds.has(id));
  return { picked, missingCount: todoIds.length - picked.length };
};

/**
 * 고른 것 중 그사이 이을 수 없게 된 것을 빼고 폼을 열 때의 안내.
 *
 * @example toMissingPicksNotice(1) // "고른 것 중 1개는 그사이 일정이 잡혔거나 완료·삭제돼서 뺐어요."
 */
export const toMissingPicksNotice = (count: number): string => `고른 것 중 ${count}개는 그사이 일정이 잡혔거나 완료·삭제돼서 뺐어요.`;

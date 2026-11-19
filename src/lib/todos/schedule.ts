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

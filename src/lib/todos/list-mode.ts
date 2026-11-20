import { createExternalValue } from "@/lib/external-value";

/**
 * 하고 싶은 것 목록의 지금 상태. 평소(`view`), 순서 바꾸기 편집(`reorder`, #497), 일정 잡을 것 고르기(`pick`, #495).
 * 두 편집은 함께 켜지지 않는다. 편집하는 동안에는 체크·고치기·추가를 막는다.
 */
export type TodoListMode = "view" | "reorder" | "pick";

/**
 * 목록과 머리글 버튼(일정 잡기·추가)이 함께 보는 목록 상태. 화면이 숨겨지면 목록이 `view`로 되돌린다.
 *
 * @example const mode = useSyncExternalStore(todoListMode.subscribe, todoListMode.get, () => "view");
 */
export const todoListMode = createExternalValue<TodoListMode>("view");

/**
 * '아직' 구역에 고를 수 있는 하고 싶은 것이 있는지(#495). 목록이 정하고 머리글의 '일정 잡기'가 본다.
 * 목록을 받기 전(서버에서 그릴 때)에는 없다고 보고 버튼을 막아 둔다.
 *
 * @example const canPick = useSyncExternalStore(canPickTodos.subscribe, canPickTodos.get, () => false);
 */
export const canPickTodos = createExternalValue(false);

import { createExternalValue } from "@/lib/external-value";

/**
 * 하고 싶은 것 목록이 순서 바꾸기 편집 중인지(#497). 목록과 머리글의 + 버튼이 함께 본다.
 * 편집하는 동안에는 화살표만 누를 수 있고 체크·고치기·추가를 막는다. 화면이 숨겨지면 목록이 끝낸다.
 *
 * @example const isReordering = useSyncExternalStore(todoReorderMode.subscribe, todoReorderMode.get, () => false);
 */
export const todoReorderMode = createExternalValue(false);

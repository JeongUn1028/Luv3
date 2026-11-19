// 다른 화면에서 하고 싶은 것 목록의 한 줄로 가라고 남긴 id(#471). 목록이 보이면 한 번 꺼내 그 줄을 보여 준다
let requestedTodoId: string | undefined;

/**
 * 하고 싶은 것 목록으로 옮기기 전에 보여 줄 줄을 남긴다. 캘린더 일정 읽기 창의 "하고 싶은 것" 줄과, 하고 싶은 것에 일정을 잡아 저장할 때 쓴다.
 *
 * @example <Link href={TODOS_PATH} onClick={() => requestTodoFocus(todo.id)}>
 */
export const requestTodoFocus = (todoId: string): void => {
  requestedTodoId = todoId;
};

/**
 * 남긴 줄을 꺼낸다. 한 번 꺼내면 비워, 다음에 목록을 열 때 같은 줄로 다시 옮기지 않는다.
 *
 * @example const todoId = takeTodoFocus(); if (todoId) reveal(todoId);
 */
export const takeTodoFocus = (): string | undefined => {
  const todoId = requestedTodoId;
  requestedTodoId = undefined;
  return todoId;
};

import type { SaveErrorCode, UpdatedRows } from "@/lib/save-outcome";
import type { TodoAction } from "./list";

/** 목록에서 체크·순서 바꾸기를 저장하지 못했을 때 */
export const TODO_ACTION_FAILED_MESSAGE = "저장하지 못했어요. 잠시 후 다시 시도해 주세요.";
/** 상대가 지웠거나 완료한 항목을 바꾸려 했을 때. 목록은 새로 불러온 서버 목록으로 맞춘다 */
export const TODO_ALREADY_DELETED_MESSAGE = "이미 지워진 항목이에요. 목록을 새로 불러왔어요.";

// PostgREST가 함수의 no_data_found를 전달한 코드(마이그레이션 move_todo)
const NO_DATA_FOUND = "P0002";

/** 완료 시각을 고칠 수 있는 표. Supabase의 `createClient().from("todos")`가 이 모양이다 */
export interface CompletableTodos {
  update: (values: { completed_at: string | null }) => { eq: (column: "id", value: string) => { select: (columns: "id") => PromiseLike<UpdatedRows> } };
}

interface SaveTodoActionParams {
  action: TodoAction;
  todos: CompletableTodos;
  /** `(args) => supabase.rpc("move_todo", args)` */
  moveTodo: (args: { p_id: string; p_offset: number }) => PromiseLike<{ error: SaveErrorCode | null }>;
}

/**
 * 목록의 체크·순서 바꾸기를 DB에 저장한다.
 *
 * @returns 실패하면 화면에 보여 줄 문구, 성공하면 undefined
 * @example const message = await saveTodoAction({ action, todos: supabase.from("todos"), moveTodo: (args) => supabase.rpc("move_todo", args) })
 */
export const saveTodoAction = async ({ action, todos, moveTodo }: SaveTodoActionParams): Promise<string | undefined> => {
  if (action.type === "move") {
    const { error } = await moveTodo({ p_id: action.id, p_offset: action.offset });
    if (!error) return undefined;
    return error.code === NO_DATA_FOUND ? TODO_ALREADY_DELETED_MESSAGE : TODO_ACTION_FAILED_MESSAGE;
  }
  // 상대가 지운 항목은 오류 없이 0행이 바뀌므로, 바뀐 행을 받아 확인한다
  const { data, error } = await todos
    .update({ completed_at: action.completedAt ?? null })
    .eq("id", action.id)
    .select("id");
  if (error || !data) return TODO_ACTION_FAILED_MESSAGE;
  return data.length === 0 ? TODO_ALREADY_DELETED_MESSAGE : undefined;
};

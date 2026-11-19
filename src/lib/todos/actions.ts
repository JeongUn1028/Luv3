import type { SaveErrorCode, UpdatedRows } from "@/lib/save-outcome";
import { DB_ERROR_CODE } from "@/lib/supabase/error-codes";
import type { TodoAction } from "./list";

/** 목록에서 체크·순서 바꾸기·[아직]을 저장하지 못했을 때 */
export const TODO_ACTION_FAILED_MESSAGE = "저장하지 못했어요. 잠시 후 다시 시도해 주세요.";
/** 상대가 지웠거나 완료한 항목을 바꾸려 했을 때. 목록은 새로 불러온 서버 목록으로 맞춘다 */
export const TODO_ALREADY_DELETED_MESSAGE = "이미 지워진 항목이에요. 목록을 새로 불러왔어요.";

/** 목록에서 바로 고치는 칸: 완료 시각, 지난 일정 묻기의 [아직](#471) */
type TodoListUpdate = { completed_at: string | null } | { event_not_yet_date: string };

/** 목록에서 바로 고칠 수 있는 표. Supabase의 `createClient().from("todos")`가 이 모양이다 */
export interface CompletableTodos {
  update: (values: TodoListUpdate) => { eq: (column: "id", value: string) => { select: (columns: "id") => PromiseLike<UpdatedRows> } };
}

interface SaveTodoActionParams {
  action: TodoAction;
  todos: CompletableTodos;
  /** `(args) => supabase.rpc("move_todo", args)` */
  moveTodo: (args: { p_id: string; p_offset: number }) => PromiseLike<{ error: SaveErrorCode | null }>;
}

/**
 * 목록의 체크·순서 바꾸기·지난 일정의 [아직]을 DB에 저장한다.
 *
 * @returns 실패하면 화면에 보여 줄 문구, 성공하면 undefined
 * @example const message = await saveTodoAction({ action, todos: supabase.from("todos"), moveTodo: (args) => supabase.rpc("move_todo", args) })
 */
export const saveTodoAction = async ({ action, todos, moveTodo }: SaveTodoActionParams): Promise<string | undefined> => {
  if (action.type === "move") {
    const { error } = await moveTodo({ p_id: action.id, p_offset: action.offset });
    if (!error) return undefined;
    return error.code === DB_ERROR_CODE.notFound ? TODO_ALREADY_DELETED_MESSAGE : TODO_ACTION_FAILED_MESSAGE;
  }
  // 상대가 지운 항목은 오류 없이 0행이 바뀌므로, 바뀐 행을 받아 확인한다
  const values: TodoListUpdate =
    action.type === "complete" ? { completed_at: action.completedAt ?? null } : { event_not_yet_date: action.date };
  const { data, error } = await todos
    .update(values)
    .eq("id", action.id)
    .select("id");
  if (error || !data) return TODO_ACTION_FAILED_MESSAGE;
  return data.length === 0 ? TODO_ALREADY_DELETED_MESSAGE : undefined;
};

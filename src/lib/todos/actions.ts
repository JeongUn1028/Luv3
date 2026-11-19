import type { SaveErrorCode, UpdatedRows } from "@/lib/save-outcome";
import { DB_ERROR_CODE } from "@/lib/supabase/error-codes";
import type { TodoAction } from "./list";

/** 목록에서 체크·순서 바꾸기·[아직]을 저장하지 못했을 때 */
export const TODO_ACTION_FAILED_MESSAGE = "저장하지 못했어요. 잠시 후 다시 시도해 주세요.";
/** 상대가 지웠거나 완료한 항목을 바꾸려 했을 때. 목록은 새로 불러온 서버 목록으로 맞춘다 */
export const TODO_ALREADY_DELETED_MESSAGE = "이미 지워진 항목이에요. 목록을 새로 불러왔어요.";
/** [아직]을 누르는 사이 상대가 항목을 지웠거나 완료했거나 일정을 바꿨을 때(#471). 목록은 새로 불러온 서버 목록으로 맞춘다 */
export const TODO_EVENT_CHANGED_MESSAGE = "그사이 바뀐 항목이에요. 목록을 새로 불러왔어요.";

/** 목록에서 바로 고치는 칸: 완료 시각, 지난 일정 묻기의 [아직](#471) */
type TodoListUpdate = { completed_at: string | null } | { event_not_yet_date: string };

/** 고칠 행을 거르는 조건을 붙인 고치기 */
interface FilteredTodoUpdate {
  eq: (column: "id" | "event_id", value: string) => FilteredTodoUpdate;
  is: (column: "completed_at", value: null) => FilteredTodoUpdate;
  select: (columns: "id") => PromiseLike<UpdatedRows>;
}

/** 목록에서 바로 고칠 수 있는 표. Supabase의 `createClient().from("todos")`가 이 모양이다 */
export interface CompletableTodos {
  update: (values: TodoListUpdate) => FilteredTodoUpdate;
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
  if (action.type === "notYet") {
    // 화면에서 본 일정에 이어진 하지 않은 항목일 때만 적는다. 그사이 상대가 일정을 바꿨으면 새 일정에 앞 일정의 [아직]이 붙어
    // 새 일정이 지나도 묻지 않게 된다(연결이 바뀔 때 비우는 트리거는 그 뒤에 적은 값을 비우지 못한다)
    const { data, error } = await todos
      .update({ event_not_yet_date: action.date })
      .eq("id", action.id)
      .eq("event_id", action.eventId)
      .is("completed_at", null)
      .select("id");
    if (error || !data) return TODO_ACTION_FAILED_MESSAGE;
    return data.length === 0 ? TODO_EVENT_CHANGED_MESSAGE : undefined;
  }
  // 상대가 지운 항목은 오류 없이 0행이 바뀌므로, 바뀐 행을 받아 확인한다
  const { data, error } = await todos
    .update({ completed_at: action.completedAt ?? null })
    .eq("id", action.id)
    .select("id");
  if (error || !data) return TODO_ACTION_FAILED_MESSAGE;
  return data.length === 0 ? TODO_ALREADY_DELETED_MESSAGE : undefined;
};

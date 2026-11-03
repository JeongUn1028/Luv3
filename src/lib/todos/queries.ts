import "server-only";
import { isRecordId } from "@/lib/dates/detail";
import { createClient } from "@/lib/supabase/server";
import { toTodo, type Todo } from "./list";

/** 하고 싶은 것 목록을 불러오지 못했을 때 */
export class TodoLoadError extends Error {
  constructor(options?: ErrorOptions) {
    super("목록을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.", options);
    this.name = "TodoLoadError";
  }
}

const TODO_COLUMNS = "id, content, sort_order, completed_at, author:members!todos_author_id_fkey(nickname)";

/**
 * 둘이 함께 쓰는 하고 싶은 것 목록 전체를 작성자 닉네임과 함께 읽는다. 하지 않은 것·완료한 것 나누기는 `groupTodos`가 한다.
 *
 * @throws {TodoLoadError} 조회가 실패했을 때
 * @example const { open, done } = groupTodos(await getTodos())
 */
export const getTodos = async (): Promise<Todo[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase.from("todos").select(TODO_COLUMNS).order("sort_order");
  if (error) throw new TodoLoadError({ cause: error });
  return data.map(toTodo);
};

/**
 * 하고 싶은 것 하나를 읽는다(수정 화면).
 *
 * @returns 없는 항목이거나 id 형식이 틀리면 undefined
 * @throws {TodoLoadError} 조회가 실패했을 때
 * @example const todo = await getTodo(id); if (!todo) notFound()
 */
export const getTodo = async (id: string): Promise<Todo | undefined> => {
  if (!isRecordId(id)) return undefined;
  const supabase = await createClient();
  const { data, error } = await supabase.from("todos").select(TODO_COLUMNS).eq("id", id).maybeSingle();
  if (error) throw new TodoLoadError({ cause: error });
  return data ? toTodo(data) : undefined;
};

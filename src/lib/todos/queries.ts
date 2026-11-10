import "server-only";
import { isRecordId } from "@/lib/dates/detail";
import { readAllRows } from "@/lib/supabase/read-all-rows";
import { createClient } from "@/lib/supabase/server";
import { toTodo, type Todo } from "./list";

/** 하고 싶은 것 목록을 불러오지 못했을 때 */
export class TodoLoadError extends Error {
  constructor(options?: ErrorOptions) {
    super("목록을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.", options);
    this.name = "TodoLoadError";
  }
}

// 작성자를 읽지 않는 이유는 `TodoRow` 주석에 있다
const TODO_COLUMNS = "id, content, sort_order, completed_at";

/**
 * 둘이 함께 쓰는 하고 싶은 것 목록 전체를 정한 순서대로 읽는다. 1000개가 넘어도 잘리지 않게 끝까지 나눠 읽는다(#272).
 * 순서 정하기와 하지 않은 것·완료한 것 나누기는 `groupTodos`가 한다.
 *
 * @throws {TodoLoadError} 조회가 실패했을 때
 * @example const { open, done } = groupTodos(await getTodos())
 */
export const getTodos = async (): Promise<Todo[]> => {
  const supabase = await createClient();
  const rows = await readAllRows({
    fetchPage: (afterId, limit) => {
      const query = supabase.from("todos").select(TODO_COLUMNS);
      return (afterId ? query.gt("id", afterId) : query).order("id").limit(limit);
    },
    toError: (cause) => new TodoLoadError({ cause }),
  });
  return rows.map(toTodo);
};

/** 수정 화면이 읽는 하고 싶은 것. 판 번호로 화면을 연 뒤 상대가 내용을 고쳤는지 알아본다(#161) */
export interface EditableTodo extends Todo {
  revision: string;
}

/**
 * 하고 싶은 것 하나를 읽는다(수정 화면).
 *
 * @returns 없는 항목이거나 id 형식이 틀리면 undefined
 * @throws {TodoLoadError} 조회가 실패했을 때
 * @example const todo = await getTodo(id); if (!todo) notFound()
 */
export const getTodo = async (id: string): Promise<EditableTodo | undefined> => {
  if (!isRecordId(id)) return undefined;
  const supabase = await createClient();
  const { data, error } = await supabase.from("todos").select(`${TODO_COLUMNS}, revision`).eq("id", id).maybeSingle();
  if (error) throw new TodoLoadError({ cause: error });
  return data ? { ...toTodo(data), revision: data.revision } : undefined;
};

import "server-only";
import type { LinkedTodo } from "@/lib/events/form";
import { isUuid } from "@/lib/guards";
import { catchLoadError } from "@/lib/load";
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
const TODO_BASE_COLUMNS = "id, content, sort_order, completed_at, revision";
// 목록과 고치기 화면은 이어진 일정(#471)도 읽어 칩에 날짜와 누구 일정인지를, 지난 일정에 [아직]을 눌렀는지를 쓴다
const TODO_COLUMNS = `${TODO_BASE_COLUMNS}, event_not_yet_date, event:events!todos_event_id_fkey(id, date, end_date, is_together, author:members!events_author_id_fkey(nickname))` as const;
// 목록은 그 일정으로 남긴 기록(#473)도 읽어 완료 줄에 "기록 보기"를 두고 지난 일정 묻기를 뺀다
const TODO_LIST_COLUMNS = `${TODO_BASE_COLUMNS}, event_not_yet_date, event:events!todos_event_id_fkey(id, date, end_date, is_together, author:members!events_author_id_fkey(nickname), records:dates!dates_event_id_fkey(id))` as const;

/**
 * 둘이 함께 쓰는 하고 싶은 것 목록 전체를 정한 순서대로 읽는다. 1000개가 넘어도 잘리지 않게 끝까지 나눠 읽는다(#272).
 * 순서 정하기와 하지 않은 것·완료한 것 나누기는 `groupTodos`가, 하지 않은 것을 일정 잡힌 것·아직으로 나누기는 `splitScheduledTodos`가 한다.
 *
 * @throws {TodoLoadError} 조회가 실패했을 때
 * @example const { open, done } = groupTodos(await getTodos())
 */
export const getTodos = async (): Promise<Todo[]> => {
  const supabase = await createClient();
  const rows = await readAllRows({
    fetchPage: (afterId, limit) => {
      const query = supabase.from("todos").select(TODO_LIST_COLUMNS);
      return (afterId ? query.gt("id", afterId) : query).order("id").limit(limit);
    },
    toError: (cause) => new TodoLoadError({ cause }),
  });
  return rows.map(toTodo);
};

/** 홈 하고 싶은 것 칸에 보여 줄 것(#344·#497) */
export interface OpenTodoPreview {
  /** '아직' 구역 맨 위 몇 개 */
  todos: Todo[];
  /** '아직'은 비었지만 하지 않은 것이 있다(모두 일정이 잡혔다). 빈 목록처럼 "적어 보세요"를 보이지 않게 가른다 */
  isAllScheduled: boolean;
}

/**
 * 일정이 없는 하지 않은 하고 싶은 것('아직' 구역, `splitScheduledTodos`의 unscheduled와 같은 순서)을 맨 위 `limit`개만 읽는다(홈 미리보기, #344·#497).
 * 일정 잡힌 것은 홈 '다음 일정' 칸에 이미 나온다(#474). 완료한 항목까지 전부 받지 않고 부분 인덱스(`todos_open_sort_order_idx`)로 앞 몇 개만 읽는다.
 * '아직'이 비었을 때만 하지 않은 것이 하나라도 있는지 한 번 더 읽는다.
 *
 * @throws {TodoLoadError} 조회가 실패했을 때
 * @example const { todos, isAllScheduled } = await getOpenTodoPreview(3)
 */
export const getOpenTodoPreview = async (limit: number): Promise<OpenTodoPreview> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("todos")
    .select(TODO_BASE_COLUMNS)
    .is("completed_at", null)
    .is("event_id", null)
    .order("sort_order")
    .order("id")
    .limit(limit);
  if (error) throw new TodoLoadError({ cause: error });
  if (data.length > 0) return { todos: data.map(toTodo), isAllScheduled: false };

  const { data: openRows, error: openError } = await supabase.from("todos").select("id").is("completed_at", null).limit(1);
  if (openError) throw new TodoLoadError({ cause: openError });
  return { todos: [], isAllScheduled: openRows.length > 0 };
};

/**
 * 하고 싶은 것 하나를 읽는다(수정 화면). 판 번호로 화면을 연 뒤 상대가 내용을 고쳤는지 알아본다(#161).
 *
 * @returns 없는 항목이거나 id 형식이 틀리면 undefined
 * @throws {TodoLoadError} 조회가 실패했을 때
 * @example const todo = await getTodo(id); if (!todo) notFound()
 */
export const getTodo = async (id: string): Promise<Todo | undefined> => {
  if (!isUuid(id)) return undefined;
  const supabase = await createClient();
  const { data, error } = await supabase.from("todos").select(TODO_COLUMNS).eq("id", id).maybeSingle();
  if (error) throw new TodoLoadError({ cause: error });
  return data ? toTodo(data) : undefined;
};

/** 일정 폼의 고르는 창에 보일 하고 싶은 것 상한. 둘이 쓰는 목록이라 하지 않은 것이 이만큼 쌓일 일은 없다 */
const LINKABLE_TODO_LIMIT = 200;

/**
 * 일정 폼에서 이을 수 있는 하고 싶은 것(#472): 아직 일정이 없고 완료하지 않은 것을 목록 순서(`groupTodos`의 open)대로 읽는다.
 *
 * @throws {TodoLoadError} 조회가 실패했을 때
 * @example const todos = await getLinkableTodos()
 */
export const getLinkableTodos = async (): Promise<LinkedTodo[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("todos")
    .select("id, content")
    .is("completed_at", null)
    .is("event_id", null)
    .order("sort_order")
    .order("id")
    .limit(LINKABLE_TODO_LIMIT);
  if (error) throw new TodoLoadError({ cause: error });
  return data;
};

/**
 * 일정 폼이 쓰는 `getLinkableTodos`. 불러오지 못해도 일정은 고칠 수 있어야 하므로 빈 목록을 돌려줘 칸을 숨긴다(원인은 `catchLoadError`가 서버 로그에 남긴다).
 *
 * @example <EventForm linkableTodos={await loadLinkableTodos()} />
 */
export const loadLinkableTodos = async (): Promise<LinkedTodo[]> => {
  const todos = await catchLoadError(getLinkableTodos, TodoLoadError);
  return todos instanceof TodoLoadError ? [] : todos;
};

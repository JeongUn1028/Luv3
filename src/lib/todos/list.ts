/** 하고 싶은 것 탭 주소 */
export const TODOS_PATH = "/todos";

/** 하고 싶은 것에 이어진 일정 행(#471). 일정의 작성자는 한 사람 일정의 주인 이름에 쓴다 */
export interface TodoEventRow {
  id: string;
  date: string;
  end_date: string | null;
  is_together: boolean;
  author: { nickname: string } | null;
  /** 이 일정으로 남긴 기록(#473). 반복하지 않는 일정이라 많아야 하나다. 읽지 않은 조회는 빈다 */
  records?: { id: string }[];
}

/** 목록 조회 때 읽는 `todos` 행. 둘이 함께 쓰는 목록이라 작성자는 읽지 않는다(#204) */
export interface TodoRow {
  id: string;
  content: string;
  sort_order: number;
  completed_at: string | null;
  revision: string;
  /** 이어진 일정 날짜가 지나 묻는 칸에서 [아직]을 누른 그 일정의 마지막 날(#471). 읽지 않은 조회는 빈다 */
  event_not_yet_date?: string | null;
  /** 이어진 일정. 없으면 null, 읽지 않은 조회는 빈다 */
  event?: TodoEventRow | null;
}

/** 하고 싶은 것에 이어진 일정(#471) */
export interface TodoEvent {
  id: string;
  /** 시작일(YYYY-MM-DD) */
  date: string;
  /** 기간 일정의 끝 날짜. 하루 일정이면 undefined */
  endDate: string | undefined;
  isTogether: boolean;
  authorNickname: string | undefined;
  /** 이 일정으로 남긴 기록(#473). 완료 줄의 "기록 보기"가 연다. 없으면 두지 않는다 */
  recordId?: string;
  /** 날짜가 지나 묻는 칸에서 [아직]을 누른 일정의 마지막 날. 일정을 미뤄 마지막 날이 달라지면 다시 묻는다 */
  notYetDate: string | undefined;
}

/** 화면에 그리는 하고 싶은 것 하나 */
export interface Todo {
  id: string;
  content: string;
  /** 작을수록 위. 완료를 풀면 이 자리로 돌아온다 */
  sortOrder: number;
  /** 완료한 시각(ISO). 아직 하지 않았으면 undefined */
  completedAt: string | undefined;
  /** 판 번호(#161). 목록에 먼저 보여 준 저장 중인 내용을 서버 목록이 따라잡았는지 견준다(#345) */
  revision: string;
  /** 이어진 일정(#471). 없으면 undefined */
  event?: TodoEvent | undefined;
}

/** 목록에서 하는 동작. 저장이 끝나기 전에 화면에 먼저 반영할 때 쓴다 */
export type TodoAction =
  | { type: "move"; id: string; offset: -1 | 1 }
  | { type: "complete"; id: string; completedAt: string | undefined }
  /** 지난 일정 묻기의 [아직](#471). eventId·date는 누를 때 본 일정과 그 마지막 날 */
  | { type: "notYet"; id: string; eventId: string; date: string };

const toTodoEvent = ({ id, date, end_date, is_together, author, records }: TodoEventRow, notYetDate: string | null | undefined): TodoEvent => ({
  id,
  ...(records?.[0] ? { recordId: records[0].id } : {}),
  date,
  endDate: end_date ?? undefined,
  isTogether: is_together,
  authorNickname: author?.nickname,
  notYetDate: notYetDate ?? undefined,
});

/**
 * 조회한 행을 화면용 값으로 바꾼다. DB의 null은 undefined로 바꾼다.
 *
 * @example const todos = data.map(toTodo)
 */
export const toTodo = ({ id, content, sort_order, completed_at, revision, event_not_yet_date, event }: TodoRow): Todo => ({
  id,
  content,
  sortOrder: sort_order,
  completedAt: completed_at ?? undefined,
  revision,
  ...(event ? { event: toTodoEvent(event, event_not_yet_date) } : {}),
});

const isOpen = (todo: Todo): boolean => todo.completedAt === undefined;

const compareBySortOrder = (left: Todo, right: Todo): number =>
  left.sortOrder - right.sortOrder || left.id.localeCompare(right.id);

// DB 값(+00:00)과 화면에서 만든 값(Z)의 표기가 달라 글자가 아닌 시각으로 비교한다
const toTime = (todo: Todo): number => (todo.completedAt === undefined ? 0 : Date.parse(todo.completedAt));

/**
 * 하지 않은 항목(정한 순서대로)과 완료한 항목(최근에 완료한 것부터)으로 나눈다. 화면에서는 완료한 항목을 아래에 그린다.
 *
 * @example const { open, done } = groupTodos(todos)
 */
export const groupTodos = <T extends Todo>(todos: T[]): { open: T[]; done: T[] } => ({
  open: todos.filter(isOpen).toSorted(compareBySortOrder),
  done: todos
    .filter((todo) => !isOpen(todo))
    .toSorted((left, right) => toTime(right) - toTime(left) || compareBySortOrder(left, right)),
});

const isScheduled = (todo: Todo): boolean => todo.event !== undefined;

/**
 * 하지 않은 항목을 일정 잡힌 것(일정 시작일이 가까운 순서, 같은 날이면 정한 순서)과 아직인 것(정한 순서)으로 나눈다(#497).
 * 지난 일정이 이어진 항목도 일정 잡힌 것에 남는다(그 줄에서 다녀왔는지 묻는다, #471).
 *
 * @example const { scheduled, unscheduled } = splitScheduledTodos(groupTodos(todos).open)
 */
export const splitScheduledTodos = <T extends Todo>(open: T[]): { scheduled: T[]; unscheduled: T[] } => ({
  scheduled: open
    .filter(isScheduled)
    .toSorted((left, right) => (left.event?.date ?? "").localeCompare(right.event?.date ?? "") || compareBySortOrder(left, right)),
  unscheduled: open.filter((todo) => !isScheduled(todo)).toSorted(compareBySortOrder),
});

/** 하지 않은 항목 중 같은 구역(일정이 있는지 없는지)의 바로 위·아래 항목과 순서 값을 바꾼다(DB의 move_todo와 같은 규칙, #497) */
const moveTodo = (todos: Todo[], id: string, offset: -1 | 1): Todo[] => {
  const { open } = groupTodos(todos);
  const target = open.find((todo) => todo.id === id);
  if (!target) return todos;
  const section = open.filter((todo) => isScheduled(todo) === isScheduled(target));
  const index = section.indexOf(target);
  const neighbor = section[index + offset];
  if (!neighbor) return todos;

  return todos.map((todo) => {
    if (todo.id === target.id) return { ...todo, sortOrder: neighbor.sortOrder };
    if (todo.id === neighbor.id) return { ...todo, sortOrder: target.sortOrder };
    return todo;
  });
};

/**
 * 목록에 동작 하나를 반영한 새 목록을 만든다. 저장 결과를 기다리지 않고 화면을 먼저 바꿀 때 쓴다.
 * 없는 항목이거나 옮길 수 없으면(맨 위에서 위로, 완료한 항목, 일정이 없는 항목의 [아직]) 받은 목록을 그대로 돌려준다.
 *
 * @example applyTodoAction(todos, { type: "move", id, offset: -1 })
 */
export const applyTodoAction = (todos: Todo[], action: TodoAction): Todo[] => {
  switch (action.type) {
    case "move":
      return moveTodo(todos, action.id, action.offset);
    case "complete":
      if (!todos.some((todo) => todo.id === action.id)) return todos;
      return todos.map((todo) => (todo.id === action.id ? { ...todo, completedAt: action.completedAt } : todo));
    case "notYet":
      if (!todos.some((todo) => todo.id === action.id && todo.event)) return todos;
      return todos.map((todo) => (todo.id === action.id && todo.event ? { ...todo, event: { ...todo.event, notYetDate: action.date } } : todo));
  }
};

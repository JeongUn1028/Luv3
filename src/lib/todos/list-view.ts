// 하고 싶은 것 '목록 보기' 설정과 탭 모양의 탭(#497). 설정 화면·목록·서버 조회가 함께 쓴다

/** 목록 보기. 'sections'는 한 목록을 구역으로 나누고, 'tabs'는 위에 탭 3개를 둔다. 사람마다 하나라 어느 기기에서나 같다 */
export type TodoListView = "sections" | "tabs";

/** 바꾼 적이 없을 때의 목록 보기. DB 기본값(`members.todo_list_view`)과 같아야 한다 */
export const DEFAULT_TODO_LIST_VIEW: TodoListView = "sections";

/** 설정 화면에 그리는 선택지와 순서 */
export const TODO_LIST_VIEW_OPTIONS: readonly { view: TodoListView; label: string }[] = [
  { view: "sections", label: "구역으로" },
  { view: "tabs", label: "탭으로" },
];

/**
 * DB에서 읽은 값을 목록 보기로 바꾼다. DB가 두 값만 받지만, 모르는 값이 와도 화면이 깨지지 않게 기본값으로 본다.
 *
 * @example const view = toTodoListView(member.todo_list_view);
 */
export const toTodoListView = (value: string | null | undefined): TodoListView =>
  TODO_LIST_VIEW_OPTIONS.find(({ view }) => view === value)?.view ?? DEFAULT_TODO_LIST_VIEW;

/** 탭 모양의 탭. 화면 순서대로 일정 잡힌 것 / 아직 / 완료 */
export type TodoTab = "scheduled" | "unscheduled" | "done";

/** 탭 순서. 화면을 열면 늘 '아직' 탭이다 */
export const TODO_TABS: readonly TodoTab[] = ["scheduled", "unscheduled", "done"];

/** 화면을 열 때와 편집(순서 바꾸기·일정 잡기)을 시작할 때 보는 탭 */
export const FIRST_TODO_TAB: TodoTab = "unscheduled";

/**
 * 탭 목록에서 누른 방향키·Home·End로 옮겨 갈 탭(WAI-ARIA 탭 패턴). 끝에서는 반대쪽 끝으로 돈다. 다른 키면 undefined.
 *
 * @example const next = toKeyboardTab("unscheduled", "ArrowRight"); // "done"
 */
export const toKeyboardTab = (current: TodoTab, key: string): TodoTab | undefined => {
  const index = TODO_TABS.indexOf(current);
  const last = TODO_TABS.length - 1;
  const nextIndex = { ArrowRight: index === last ? 0 : index + 1, ArrowLeft: index === 0 ? last : index - 1, Home: 0, End: last }[key];
  return nextIndex === undefined ? undefined : TODO_TABS[nextIndex];
};

/**
 * 항목이 들어 있는 탭. 새로 더한 항목이나 캘린더에서 눌러 온 항목을 보여 줄 때 그 탭을 연다. 어느 탭에도 없으면 undefined.
 *
 * @example const tab = findTodoTab({ scheduled, unscheduled, done }, justAddedId);
 */
export const findTodoTab = (lists: Readonly<Record<TodoTab, readonly { id: string }[]>>, id: string): TodoTab | undefined =>
  TODO_TABS.find((tab) => lists[tab].some((todo) => todo.id === id));

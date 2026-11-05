import { SETTINGS_PASSWORD_PATH } from "@/lib/auth/paths";

/**
 * 저장 중에 다른 화면으로 옮겼을 때 저장 결과를 알리는 알림. 결과를 보여 줄 곳이 없는 비밀번호 변경은 성공도 이 알림으로 알린다.
 *
 * @example const notice: SaveNotice = { id: "1", formKey: "todo:new", isFailure: false, title: "저장했어요", href: "/todos" };
 */
export interface SaveNotice {
  id: string;
  /** 어느 폼의 저장인지. 같은 폼을 다시 저장하면 지난 알림을 지운다 */
  formKey: string;
  isFailure: boolean;
  title: string;
  /** 제목 아래에 덧붙이는 설명 */
  description?: string;
  /** 알림의 링크가 여는 화면. 성공이면 저장한 내용, 실패면 폼. 없으면 링크를 그리지 않는다 */
  href?: string;
}

/**
 * 저장 알림 저장소. React에서는 `useSyncExternalStore`로 읽는다.
 *
 * @example useSyncExternalStore(saveNoticeStore.subscribe, saveNoticeStore.getNotices, () => [])
 */
export interface SaveNoticeStore {
  subscribe: (listener: () => void) => () => void;
  getNotices: () => readonly SaveNotice[];
  /** 알림을 더한다. 같은 폼의 지난 알림은 대신한다 */
  add: (notice: Omit<SaveNotice, "id">) => void;
  dismiss: (id: string) => void;
  clearForm: (formKey: string) => void;
}

/**
 * 저장 알림 저장소를 만든다. 폼은 다른 화면으로 옮기면 숨겨지거나 사라지므로, 어느 화면에서든 보이도록 폼 바깥에 둔다.
 *
 * @example
 * const store = createSaveNoticeStore();
 * store.add({ formKey: "todo:new", isFailure: false, title: "저장했어요", href: "/todos" });
 */
export const createSaveNoticeStore = (): SaveNoticeStore => {
  let notices: readonly SaveNotice[] = [];
  const listeners = new Set<() => void>();

  const update = (next: readonly SaveNotice[]) => {
    if (next.length === notices.length && next.every((notice, index) => notice === notices[index])) return;
    notices = next;
    listeners.forEach((listener) => listener());
  };

  return {
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getNotices: () => notices,
    add: (notice) => update([...notices.filter(({ formKey }) => formKey !== notice.formKey), { ...notice, id: crypto.randomUUID() }]),
    dismiss: (id) => update(notices.filter((notice) => notice.id !== id)),
    clearForm: (formKey) => update(notices.filter((notice) => notice.formKey !== formKey)),
  };
};

/** 앱 전체에서 하나만 쓰는 저장 알림 저장소 */
export const saveNoticeStore = createSaveNoticeStore();

/**
 * 글을 쓰는 폼 화면인지 본다. 폼은 다시 불러오면 새 key로 다시 만들어져 쓰던 내용이 사라지므로, 이 화면에서는 다시 불러오지 않는다.
 *
 * @example isWritingPath("/todos/abc/edit") // true
 */
export const isWritingPath = (pathname: string): boolean => pathname === SETTINGS_PASSWORD_PATH || /\/(new|edit)$/.test(pathname);

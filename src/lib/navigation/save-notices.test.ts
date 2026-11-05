import { describe, expect, it, vi } from "vitest";
import { createSaveNoticeStore, isWritingPath } from "./save-notices";

const RECORD_FAILURE = { formKey: "record:new", isFailure: true, title: "기록을 저장하지 못했어요", href: "/dates/new" };
const TODO_SAVED = { formKey: "todo:new", isFailure: false, title: "하고 싶은 것을 저장했어요", href: "/todos" };

describe("저장 알림 저장소", () => {
  it("알림을 더하면 구독자에게 알리고 순서대로 돌려준다", () => {
    const store = createSaveNoticeStore();
    const listener = vi.fn();
    store.subscribe(listener);

    store.add(RECORD_FAILURE);
    store.add(TODO_SAVED);

    expect(store.getNotices().map(({ title }) => title)).toEqual([RECORD_FAILURE.title, TODO_SAVED.title]);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("같은 폼의 알림을 더하면 지난 알림을 대신한다", () => {
    const store = createSaveNoticeStore();
    store.add(RECORD_FAILURE);

    store.add({ ...RECORD_FAILURE, isFailure: false, title: "기록을 저장했어요" });

    expect(store.getNotices().map(({ title }) => title)).toEqual(["기록을 저장했어요"]);
  });

  it("닫은 알림만 지운다", () => {
    const store = createSaveNoticeStore();
    store.add(RECORD_FAILURE);
    store.add(TODO_SAVED);
    const [first] = store.getNotices();

    store.dismiss(first?.id ?? "");

    expect(store.getNotices().map(({ title }) => title)).toEqual([TODO_SAVED.title]);
  });

  it("폼을 다시 저장하면 그 폼의 알림만 지운다", () => {
    const store = createSaveNoticeStore();
    store.add(RECORD_FAILURE);
    store.add(TODO_SAVED);

    store.clearForm(RECORD_FAILURE.formKey);

    expect(store.getNotices().map(({ formKey }) => formKey)).toEqual([TODO_SAVED.formKey]);
  });

  it("지울 알림이 없으면 구독자를 부르지 않아 화면을 다시 그리지 않는다", () => {
    const store = createSaveNoticeStore();
    const listener = vi.fn();
    store.subscribe(listener);

    store.clearForm("record:new");
    store.dismiss("없는 알림");

    expect(listener).not.toHaveBeenCalled();
  });

  it("구독을 끊으면 더 부르지 않는다", () => {
    const store = createSaveNoticeStore();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);

    unsubscribe();
    store.add(TODO_SAVED);

    expect(listener).not.toHaveBeenCalled();
  });
});

describe("isWritingPath", () => {
  it.each(["/dates/new", "/dates/abc/edit", "/events/new", "/events/abc/edit", "/todos/new", "/todos/abc/edit"])(
    "폼 화면 %s이면 true를 돌려준다",
    (pathname) => {
      expect(isWritingPath(pathname)).toBe(true);
    },
  );

  it("비밀번호 변경 화면도 다시 불러오면 적던 비밀번호가 사라지므로 true를 돌려준다", () => {
    expect(isWritingPath("/settings/password")).toBe(true);
  });

  it("닉네임 변경 화면도 다시 불러오면 적던 닉네임이 사라지므로 true를 돌려준다", () => {
    expect(isWritingPath("/settings/nickname")).toBe(true);
  });

  it.each(["/", "/records", "/calendar", "/todos", "/dates/abc", "/settings"])("폼이 아닌 화면 %s이면 false를 돌려준다", (pathname) => {
    expect(isWritingPath(pathname)).toBe(false);
  });
});

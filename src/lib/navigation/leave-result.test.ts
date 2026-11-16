import { describe, expect, it } from "vitest";
import {
  isBackOnScreen,
  isOnReturnedScreen,
  isWatchingForm,
  shouldReturnNow,
  toDeletedNotice,
  toDeleteFailedNotice,
  toSavedNotice,
  toSaveFailedNotice,
} from "./leave-result";

const at = (path: string) => new URL(path, "http://localhost");

describe("isWatchingForm", () => {
  it.each([
    { isVisible: true, hasReturned: false, expected: true },
    // 바로 돌아가는 이동이 끝나기 전에는 폼이 아직 보이지만 떠난 것으로 본다
    { isVisible: true, hasReturned: true, expected: false },
    { isVisible: false, hasReturned: false, expected: false },
  ])("보임 $isVisible, 바로 돌아감 $hasReturned이면 폼을 보고 있는지는 $expected다", ({ isVisible, hasReturned, expected }) => {
    expect(isWatchingForm({ isVisible, hasReturned })).toBe(expected);
  });
});

describe("isBackOnScreen", () => {
  it("바로 돌아가지 않았으면 보이는 동안 화면에 있다", () => {
    expect(isBackOnScreen({ isVisible: true, hasReturned: false, wasHidden: false })).toBe(true);
  });

  it("바로 돌아간 뒤 아직 숨겨지지 않았으면(이동 중) 화면에 없다", () => {
    expect(isBackOnScreen({ isVisible: true, hasReturned: true, wasHidden: false })).toBe(false);
  });

  it("바로 돌아갔다가 다시 이 화면으로 오면 화면에 있다", () => {
    expect(isBackOnScreen({ isVisible: true, hasReturned: true, wasHidden: true })).toBe(true);
  });

  it("숨겨져 있으면 화면에 없다", () => {
    expect(isBackOnScreen({ isVisible: false, hasReturned: false, wasHidden: true })).toBe(false);
  });
});

describe("shouldReturnNow", () => {
  it("돌아갈 곳이 있고 인터넷이 이어져 있으면 바로 돌아간다", () => {
    expect(shouldReturnNow({ returnTo: "/todos", isOnline: true })).toBe(true);
  });

  it("인터넷이 끊겼으면 실패를 그 자리에서 알리려고 남는다", () => {
    expect(shouldReturnNow({ returnTo: "/todos", isOnline: false })).toBe(false);
  });

  it("돌아갈 곳을 주지 않았으면 남는다", () => {
    expect(shouldReturnNow({ returnTo: undefined, isOnline: true })).toBe(false);
  });
});

describe("isOnReturnedScreen", () => {
  it("바로 돌아간 화면 경로에 있으면 쿼리가 달라도 돌아간 화면이다", () => {
    expect(isOnReturnedScreen({ hasReturned: true, current: at("/calendar?date=2026-11-20"), returnTo: "/calendar?date=2026-11-13", startHref: "/events/new" })).toBe(true);
  });

  it("돌아가는 이동이 끝나기 전이라 아직 시작한 화면이면 돌아간 화면으로 본다", () => {
    expect(isOnReturnedScreen({ hasReturned: true, current: at("/events/new"), returnTo: "/calendar", startHref: "/events/new" })).toBe(true);
  });

  it("뒤로 가서 다른 화면(예: 홈)에 갔으면 돌아간 화면이 아니다", () => {
    expect(isOnReturnedScreen({ hasReturned: true, current: at("/"), returnTo: "/calendar", startHref: "/events/new" })).toBe(false);
  });

  it("바로 돌아가지 않았으면 같은 경로라도 돌아간 화면이 아니다", () => {
    expect(isOnReturnedScreen({ hasReturned: false, current: at("/calendar"), returnTo: "/calendar", startHref: "/events/new" })).toBe(false);
  });
});

describe("알림 만들기", () => {
  it("저장했다는 알림은 저장한 내용으로 가는 링크를 붙인다", () => {
    expect(toSavedNotice({ formKey: "todo:new", subject: "하고 싶은 것을", href: "/todos" })).toEqual({
      formKey: "todo:new",
      isFailure: false,
      title: "하고 싶은 것을 저장했어요",
      href: "/todos",
    });
  });

  it("저장하지 못했다는 알림은 쓴 내용이 남아 있다고 알리고 폼으로 가는 링크를 붙인다", () => {
    expect(toSaveFailedNotice({ formKey: "record:new", subject: "기록을", message: "저장하지 못했어요.", isGone: false, formHref: "/dates/new" })).toEqual({
      formKey: "record:new",
      isFailure: true,
      title: "기록을 저장하지 못했어요",
      description: "쓴 내용은 그대로 있어요",
      href: "/dates/new",
    });
  });

  it("고치던 대상이 지워져 저장하지 못했으면 그 이유를 알린다", () => {
    const notice = toSaveFailedNotice({ formKey: "record:1", subject: "기록을", message: "이 기록은 이미 지워졌어요.", isGone: true, formHref: "/dates/1/edit" });

    expect(notice.description).toBe("이 기록은 이미 지워졌어요.");
  });

  it("지웠다는 알림은 링크가 없다(지운 것은 볼 곳이 없다)", () => {
    expect(toDeletedNotice({ noticeKey: "delete:record:1", subject: "기록을" })).toEqual({ formKey: "delete:record:1", isFailure: false, title: "기록을 지웠어요" });
  });

  it("떠난 사이 지우지 못했으면 돌아가서 다시 하라고 시작한 화면 링크를 붙인다", () => {
    expect(toDeleteFailedNotice({ noticeKey: "delete:record:1", subject: "기록을", isHere: false, startHref: "/dates/1" })).toEqual({
      formKey: "delete:record:1",
      isFailure: true,
      title: "기록을 지우지 못했어요",
      description: "돌아가서 다시 시도해 주세요",
      href: "/dates/1",
    });
  });

  it("그 화면에 있는데 지우지 못했으면 링크 없이 잠시 후 다시 하라고 알린다", () => {
    const notice = toDeleteFailedNotice({ noticeKey: "delete:record:1", subject: "기록을", isHere: true, startHref: "/dates/1" });

    expect(notice).toMatchObject({ description: "잠시 후 다시 시도해 주세요", href: undefined });
  });
});

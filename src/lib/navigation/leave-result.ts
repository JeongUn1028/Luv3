// 저장·지우는 사이 화면을 떠나도 결과를 알리는 훅(use-leavable-save, use-leavable-delete)의 판단 부분.
// 훅은 화면 상태(보이는지, 바로 돌아갔는지, 지금 주소)를 모아 넘기고, 알릴지·무엇을 알릴지는 여기서 정한다

import type { SaveNotice } from "./save-notices";

type NewNotice = Omit<SaveNotice, "id">;

interface ScreenState {
  /** 이 폼·화면이 지금 보이는지(숨겨지면 layout effect 정리로 false가 된다) */
  isVisible: boolean;
  /** 결과를 기다리지 않고 바로 돌아갔는지 */
  hasReturned: boolean;
}

/**
 * 저장하는 폼을 그대로 보고 있는지. 바로 돌아갔으면 이동이 끝나기 전이라 아직 보여도 떠난 것으로 본다.
 *
 * @example if (isWatchingForm({ isVisible: isVisibleRef.current, hasReturned: hasReturnedRef.current })) return;
 */
export const isWatchingForm = ({ isVisible, hasReturned }: ScreenState): boolean => isVisible && !hasReturned;

/**
 * 지우던 화면에 있는지. 바로 돌아갔으면 돌아갔다가(한 번 숨겨졌다가) 다시 이 화면으로 왔을 때만 그렇다.
 *
 * @example const isHere = isBackOnScreen({ isVisible, hasReturned, wasHidden });
 */
export const isBackOnScreen = ({ isVisible, hasReturned, wasHidden }: ScreenState & { wasHidden: boolean }): boolean =>
  isVisible && (!hasReturned || wasHidden);

/**
 * 결과를 기다리지 않고 바로 돌아갈지. 인터넷이 끊겼으면 요청은 실패하고 돌아간 뒤에는 다시 할 수 없으니 화면에 남는다.
 *
 * @example hasReturnedRef.current = shouldReturnNow({ returnTo, isOnline: navigator.onLine });
 */
export const shouldReturnNow = ({ returnTo, isOnline }: { returnTo: string | undefined; isOnline: boolean }): boolean => returnTo !== undefined && isOnline;

interface IsOnReturnedScreenParams {
  hasReturned: boolean;
  /** 지금 보는 주소 */
  current: URL;
  /** 바로 돌아갈 화면 주소 */
  returnTo: string | undefined;
  /** 저장·지우기를 시작한 화면 주소 */
  startHref: string;
}

/**
 * 바로 돌아간 화면을 보고 있는지. 돌아가는 이동이 끝나기 전이면 아직 시작한 화면 주소라 그것도 돌아간 것으로 본다(곧 돌아갈 화면이 결과를 보여 준다).
 * 쿼리는 견주지 않는다(같은 목록·캘린더면 결과를 보여 준다).
 *
 * @example if (!isOnReturnedScreen({ hasReturned, current: new URL(window.location.href), returnTo, startHref })) saveNoticeStore.add(notice);
 */
export const isOnReturnedScreen = ({ hasReturned, current, returnTo, startHref }: IsOnReturnedScreenParams): boolean => {
  const isAt = (href: string | undefined) => href !== undefined && current.pathname === new URL(href, current).pathname;
  return hasReturned && (isAt(returnTo) || isAt(startHref));
};

/**
 * 떠난 사이 저장이 끝났다는 알림.
 *
 * @example saveNoticeStore.add(toSavedNotice({ formKey: "todo:new", subject: "하고 싶은 것을", href: "/todos" }))
 */
export const toSavedNotice = ({ formKey, subject, href }: { formKey: string; subject: string; href: string }): NewNotice => ({
  formKey,
  isFailure: false,
  title: `${subject} 저장했어요`,
  href,
});

interface ToSaveFailedNoticeParams {
  formKey: string;
  subject: string;
  /** 저장 실패 문구 */
  message: string;
  /** 고치던 대상이 이미 지워졌는지. 돌아가도 고칠 폼이 없으므로 그 이유를 알린다 */
  isGone: boolean;
  /** 폼 주소. 돌아가 다시 저장할 수 있게 붙인다 */
  formHref: string;
}

/**
 * 떠난 사이 저장에 실패했다는 알림.
 *
 * @example saveNoticeStore.add(toSaveFailedNotice({ formKey, subject: "기록을", message, isGone: false, formHref: "/dates/new" }))
 */
export const toSaveFailedNotice = ({ formKey, subject, message, isGone, formHref }: ToSaveFailedNoticeParams): NewNotice => ({
  formKey,
  isFailure: true,
  title: `${subject} 저장하지 못했어요`,
  description: isGone ? message : "쓴 내용은 그대로 있어요",
  href: formHref,
});

/**
 * 떠난 사이 지우기가 끝났다는 알림.
 *
 * @example saveNoticeStore.add(toDeletedNotice({ noticeKey: `delete:record:${id}`, subject: "기록을" }))
 */
export const toDeletedNotice = ({ noticeKey, subject }: { noticeKey: string; subject: string }): NewNotice => ({
  formKey: noticeKey,
  isFailure: false,
  title: `${subject} 지웠어요`,
});

const HERE_DELETE_FAILED_DESCRIPTION = "잠시 후 다시 시도해 주세요";

interface ToDeleteFailedNoticeParams {
  noticeKey: string;
  subject: string;
  /** 지우던 화면에 있는지. 있으면 돌아갈 곳이 없어 링크를 붙이지 않는다 */
  isHere: boolean;
  /** 지우기를 시작한 화면 주소 */
  startHref: string;
}

/**
 * 지우지 못했다는 알림.
 *
 * @example saveNoticeStore.add(toDeleteFailedNotice({ noticeKey, subject: "기록을", isHere: false, startHref: "/dates/1" }))
 */
export const toDeleteFailedNotice = ({ noticeKey, subject, isHere, startHref }: ToDeleteFailedNoticeParams): NewNotice => ({
  formKey: noticeKey,
  isFailure: true,
  title: `${subject} 지우지 못했어요`,
  description: isHere ? HERE_DELETE_FAILED_DESCRIPTION : "돌아가서 다시 시도해 주세요",
  href: isHere ? undefined : startHref,
});

/**
 * 지우던 화면이 다시 보일 때 그 폼의 알림을 어떻게 할지 정한다(`saveNoticeStore.reviseForm`에 넘긴다).
 * 떠난 사이 지우지 못한 알림은 "돌아가기"가 이 화면을 가리킨다. 느린 기기에서는 화면이 다시 보이기 전에 실패가 끝나 사용자가 아직 못 봤을 수 있어(#394),
 * 남기되 이미 이 화면이라 돌아갈 링크는 뺀다. 그 밖의 알림(지웠다는 알림, 이 화면에서 붙은 실패 알림)은 머리글을 가릴 이유가 없어 지운다.
 *
 * @param currentHref 지금 화면의 경로와 쿼리
 * @example saveNoticeStore.reviseForm(noticeKey, (notice) => reviseDeleteNoticeOnReturn(notice, "/dates/1"))
 */
export const reviseDeleteNoticeOnReturn = (notice: SaveNotice, currentHref: string): SaveNotice | undefined =>
  notice.isFailure && notice.href === currentHref ? { ...notice, description: HERE_DELETE_FAILED_DESCRIPTION, href: undefined } : undefined;

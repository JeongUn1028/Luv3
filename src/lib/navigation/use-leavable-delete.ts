import { useRouter } from "next/navigation";
import { startTransition, useLayoutEffect, useRef } from "react";
import { goBackInHistory, holdDocument } from "./history-back";
import { refreshOutsideForm } from "./refresh-outside-form";
import { saveNoticeStore } from "./save-notices";
import { BACK_TRANSITION } from "./transition";

interface UseLeavableDeleteParams {
  /** 무엇을 지우는지 구분하는 알림 key. 지우는 대상마다 정해진 값을 쓴다. 예: `delete:record:${recordId}` */
  noticeKey: string;
  /** 알림에 쓰는 이름. 받침에 맞는 조사까지 적는다. 예: "기록을", "커플 사진을" */
  subject: string;
}

interface BeginDeleteParams {
  /**
   * 주면 지우기를 기다리지 않고 바로 이 화면으로 돌아간다(#346). 이 문서 안에 돌아갈 화면이 있으면 뒤로 가고, 없으면 이 주소로 옮긴다.
   * 결과는 지우는 중에 떠났을 때와 같이 다루되, 돌아간 화면을 보고 있으면 지웠다는 알림은 띄우지 않는다(이미 숨겨 보여 준다)
   */
  returnTo?: string;
  /** 앞 화면의 주소가 이 조건에 맞을 때만 뒤로 간다. 없으면 이 문서 안 어느 화면이든 뒤로 간다 */
  canGoBackTo?: (url: URL) => boolean;
}

interface LeavableDelete {
  /** 지우기를 시작할 때 부른다. 바로 돌아갔으면 `true`, 화면에 남았으면(돌아갈 곳을 주지 않았거나 인터넷이 끊김) `false` */
  beginDelete: (params?: BeginDeleteParams) => boolean;
  /**
   * 지우기가 끝나면 부른다. 화면을 보고 있으면 true를 돌려주고, 부른 쪽이 평소처럼 목록으로 옮긴다.
   * 떠났거나 바로 돌아갔으면 지금 보는 화면에 그대로 두고(목록으로 끌고 가지 않는다) 화면을 새로 받은 뒤 false를 돌려준다.
   * 떠난 곳이 돌아간 화면이 아니면 지웠다고 알린다.
   */
  finishDeleted: () => boolean;
  /**
   * 지우지 못하면 부른다. 화면을 보고 있고 그 자리에서 알릴 수 있으면(확인 창이 열려 있으면) true를 돌려주고, 부른 쪽이 알린다.
   * 그 밖에는 알림으로 알리고 false를 돌려준다. 떠났으면 돌아갈 링크도 붙인다.
   *
   * @param canShowHere 부른 쪽이 실패 문구를 보여 줄 자리가 지금 보이는지. 떠나는 순간 확인 창이 닫히므로, 떠났다가 끝나기 전에 돌아오면 false다
   */
  finishDeleteFailed: (canShowHere: boolean) => boolean;
}

/** 지금 보는 화면의 경로가 이 주소의 경로인지. 쿼리는 견주지 않는다 */
const isCurrentPath = (href: string | undefined): boolean => href !== undefined && window.location.pathname === new URL(href, window.location.href).pathname;

/**
 * 지우는 사이 다른 화면으로 옮겨도(아이폰 가장자리 밀기 등) 결과를 알리고 끌고 오지 않는 도우미(#261).
 * 저장의 `useLeavableSave`와 같이, 화면이 숨겨지면(Activity) layout effect가 정리되는 것으로 지금 이 화면을 보고 있는지 안다.
 * `beginDelete({ returnTo })`로 시작하면 지우기를 기다리지 않고 바로 돌아가고(#346), 결과는 떠났을 때와 같이 다룬다.
 *
 * @example
 * const { beginDelete, finishDeleted, finishDeleteFailed } = useLeavableDelete({ noticeKey: `delete:record:${id}`, subject: "기록을" });
 * beginDelete();
 * await remove();
 * if (finishDeleted()) router.replace(RECORDS_PATH);
 */
export const useLeavableDelete = ({ noticeKey, subject }: UseLeavableDeleteParams): LeavableDelete => {
  const router = useRouter();
  const isVisibleRef = useRef(false);
  const startHrefRef = useRef("");
  const hasReturnedRef = useRef(false);
  const returnToRef = useRef<string>(undefined);
  // 바로 돌아간 뒤 이 화면이 한 번이라도 숨겨졌는지. 돌아가는 이동이 끝나기 전에는 아직 보이지만 떠난 것으로 본다
  const wasHiddenRef = useRef(false);
  // 지우기가 끝날 때까지 다른 문서로 되돌아가 요청이 끊기지 않게 붙든 것을 푼다(#378)
  const releaseDocumentRef = useRef<() => void>(undefined);

  useLayoutEffect(() => {
    isVisibleRef.current = true;
    // 실패 알림의 "돌아가기"나 뒤로 가기로 돌아왔으니 알림이 머리글을 가릴 이유가 없다
    saveNoticeStore.clearForm(noticeKey);
    return () => {
      isVisibleRef.current = false;
      wasHiddenRef.current = true;
    };
  }, [noticeKey]);

  /** 지금 이 화면에 있는지. 바로 돌아갔으면 돌아갔다가 다시 이 화면으로 왔을 때만 그렇다 */
  const isHere = (): boolean => isVisibleRef.current && (!hasReturnedRef.current || wasHiddenRef.current);

  return {
    beginDelete: ({ returnTo, canGoBackTo } = {}) => {
      // 돌아온 화면에서 다시 지우면 지난 실패 알림은 더 이상 맞지 않는다
      saveNoticeStore.clearForm(noticeKey);
      startHrefRef.current = `${window.location.pathname}${window.location.search}`;
      returnToRef.current = returnTo;
      wasHiddenRef.current = false;
      releaseDocumentRef.current?.();
      releaseDocumentRef.current = holdDocument();
      // 인터넷이 끊겼으면 지우기는 실패하고, 돌아간 뒤에는 다시 지울 수 없다. 화면에 남아 그 자리에서 알린다
      hasReturnedRef.current = returnTo !== undefined && navigator.onLine;
      if (!hasReturnedRef.current || returnTo === undefined) return false;
      if (!goBackInHistory({ canReturnTo: canGoBackTo })) startTransition(() => router.replace(returnTo, { transitionTypes: BACK_TRANSITION }));
      return true;
    },
    finishDeleted: () => {
      releaseDocumentRef.current?.();
      if (isHere()) return true;
      // 지금 보는 목록에 지운 항목이 남아 있을 수 있다. 다른 폼을 쓰는 중이면 쓰던 내용이 사라지므로 돌아갈 때로 미룬다
      refreshOutsideForm(() => startTransition(() => router.refresh()));
      // 돌아가는 이동이 끝나기 전이면 아직 이 화면 주소다. 곧 돌아갈 화면이 숨겨 보여 주므로 알리지 않는다
      const isOnReturnedScreen = hasReturnedRef.current && (isCurrentPath(returnToRef.current) || isCurrentPath(startHrefRef.current));
      if (!isOnReturnedScreen) saveNoticeStore.add({ formKey: noticeKey, isFailure: false, title: `${subject} 지웠어요` });
      return false;
    },
    finishDeleteFailed: (canShowHere) => {
      releaseDocumentRef.current?.();
      const isHereNow = isHere();
      if (isHereNow && canShowHere) return true;
      saveNoticeStore.add({
        formKey: noticeKey,
        isFailure: true,
        title: `${subject} 지우지 못했어요`,
        description: isHereNow ? "잠시 후 다시 시도해 주세요" : "돌아가서 다시 시도해 주세요",
        // 이미 그 화면에 있으면 돌아갈 곳이 없다
        href: isHereNow ? undefined : startHrefRef.current,
      });
      return false;
    },
  };
};

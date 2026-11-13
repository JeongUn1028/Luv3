import { useRouter } from "next/navigation";
import { startTransition, useLayoutEffect, useRef, useState } from "react";
import { isScreenOutdatedAfterFailure, type SaveFailure } from "@/lib/save-outcome";
import { goBackInHistory } from "./history-back";
import { refreshOutsideForm } from "./refresh-outside-form";
import { refreshSignedInScreen } from "./refresh-signed-in";
import { saveNoticeStore } from "./save-notices";
import { markAllScreensLoaded, markAllScreensStale } from "./screen-freshness";
import { BACK_TRANSITION } from "./transition";

/**
 * 저장에 실패한 내용. 폼을 다시 열 때 그대로 채운다.
 *
 * @example const failedSaves = new Map<string, FailedSave<string>>();
 */
export interface FailedSave<Draft> {
  draft: Draft;
  message: string;
}

interface UseLeavableSaveParams<Draft> {
  /** 어느 폼인지(새로 쓰기와 고치기, 고치는 대상을 구분한다) */
  formKey: string;
  /** 알림에 쓰는 이름. 받침에 맞는 조사까지 적는다. 예: "기록을", "하고 싶은 것을" */
  subject: string;
  /** 폼 파일마다 하나 두는 실패 내용 보관함. 화면을 많이 옮겨 폼이 사라져도 쓴 내용과 고른 사진을 잃지 않게 메모리에 둔다 */
  failedSaves: Map<string, FailedSave<Draft>>;
}

interface BeginSaveParams {
  /**
   * 주면 저장을 기다리지 않고 바로 이 화면으로 돌아간다(#345). 앱 안에 돌아갈 화면이 있으면 뒤로 버튼처럼 뒤로 가고, 없으면 이 주소로 옮긴다.
   * 저장 결과는 저장 중에 떠났을 때와 같이 다루되, 이 화면을 보고 있으면 저장했다는 알림은 띄우지 않는다(이미 보여 준다).
   * 뒤로 가서 다른 화면(예: 홈)에 갔으면 그 화면은 저장 중인 내용을 모르므로 알린다
   */
  returnTo?: string;
}

interface FinishSavedParams {
  /** 저장한 내용을 보여 주는 화면 */
  href: string;
  /** 폼을 처음 상태로 되돌린다. 숨겨진 폼을 다시 열었을 때 같은 내용을 또 저장하지 않게 한다 */
  reset: () => void;
}

/** 실패한 내용과 실패 이유(`SaveFailure`). 고치는 대상이 이미 지워졌으면(`isGone`) 돌아가도 고칠 폼이 없으므로 내용을 보관하지 않고 그 이유를 알린다 */
type FinishFailedParams<Draft> = FailedSave<Draft> & Partial<Omit<SaveFailure, "message">>;

export interface LeavableSave<Draft> {
  /** 지난번 실패로 보관된 내용. 있으면 폼의 처음 값으로 쓴다 */
  failedSave: FailedSave<Draft> | undefined;
  /** 저장을 시작할 때 부른다. 바로 돌아갔으면 `true`, 폼에 남았으면(인터넷이 끊김) `false` */
  beginSave: (params?: BeginSaveParams) => boolean;
  /** 저장이 끝나면 부른다. 폼을 보고 있으면 저장한 내용으로 옮기고, 떠났으면 그 화면에 두고 알린다 */
  finishSaved: (params: FinishSavedParams) => void;
  /** 저장에 실패하면 부른다. 폼을 보고 있으면 폼이 알리고, 떠났으면 내용을 보관하고 알린다 */
  finishFailed: (params: FinishFailedParams<Draft>) => void;
}

/**
 * 저장하는 사이 다른 화면으로 옮겨도 끌고 오지 않는 폼 저장 도우미(#104).
 * 폼이 숨겨지면(Activity) layout effect가 정리되므로, 주소를 비교하지 않고도 지금 이 폼을 보고 있는지 알 수 있다.
 * 같은 주소를 다시 열어 새 폼이 만들어진 경우에도 예전 폼은 떠난 것으로 본다.
 *
 * 저장 실패(`SaveFailure`)는 `finishFailed({ draft, ...failure })`로 넘기고, 다시 저장할 칸은 `toFailedSaveFields`(revision.ts)로 만든다.
 * `beginSave({ returnTo })`로 시작하면 저장을 기다리지 않고 바로 돌아가고, 결과는 떠났을 때와 같이 다룬다.
 *
 * @example
 * const { failedSave, beginSave, finishSaved, finishFailed } = useLeavableSave({ formKey: "todo:new", subject: "하고 싶은 것을", failedSaves });
 */
export const useLeavableSave = <Draft>({ formKey, subject, failedSaves }: UseLeavableSaveParams<Draft>): LeavableSave<Draft> => {
  const router = useRouter();
  const [failedSave] = useState(() => failedSaves.get(formKey));
  const isVisibleRef = useRef(false);
  const formHrefRef = useRef("");
  // 바로 돌아간 저장인지. 돌아가는 이동이 끝나기 전에 저장이 끝나도 폼을 보는 것으로 여겨 다시 옮기지 않게 한다
  const hasReturnedRef = useRef(false);
  const returnToRef = useRef<string>(undefined);

  useLayoutEffect(() => {
    isVisibleRef.current = true;
    // 폼에 돌아왔으니 알림이 머리글을 가릴 이유가 없다. 보관한 내용도 한 번만 채워, 쓰지 않기로 하면 다음에는 빈 폼을 연다
    failedSaves.delete(formKey);
    saveNoticeStore.clearForm(formKey);
    return () => {
      isVisibleRef.current = false;
    };
  }, [failedSaves, formKey]);

  return {
    failedSave,
    beginSave: ({ returnTo } = {}) => {
      formHrefRef.current = `${window.location.pathname}${window.location.search}`;
      returnToRef.current = returnTo;
      // 인터넷이 끊겼으면 저장은 실패하고, 돌아간 뒤에는 폼을 다시 열 수 없다. 폼에 남아 그 자리에서 알린다
      hasReturnedRef.current = returnTo !== undefined && navigator.onLine;
      if (!hasReturnedRef.current || returnTo === undefined) return false;
      if (!goBackInHistory()) startTransition(() => router.replace(returnTo, { transitionTypes: BACK_TRANSITION }));
      return true;
    },
    finishSaved: ({ href, reset }) => {
      const hasReturned = hasReturnedRef.current;
      const isVisible = isVisibleRef.current && !hasReturned;
      startTransition(() => {
        if (isVisible) {
          router.replace(href, { transitionTypes: BACK_TRANSITION });
          router.refresh();
          markAllScreensLoaded();
        } else {
          // 다른 폼을 쓰는 중이면 다시 불러올 때 쓰던 내용이 사라진다
          refreshOutsideForm(() => router.refresh());
        }
        reset();
      });
      const isOnReturnedScreen = hasReturned && window.location.pathname === returnToRef.current;
      if (!isVisible && !isOnReturnedScreen) saveNoticeStore.add({ formKey, isFailure: false, title: `${subject} 저장했어요`, href });
    },
    finishFailed: ({ draft, message, ...failure }) => {
      const { isGone = false } = failure;
      // 숨겨 둔 목록·상세가 예전 내용을 보여 주면 돌아갈 때 바로 새로 불러오게 한다.
      // 바로 돌아간 화면은 이미 보고 있어 돌아갈 일이 없으니 지금 새로 받는다(로그인이 풀렸으면 받지 않는다)
      if (isScreenOutdatedAfterFailure(failure)) {
        markAllScreensStale();
        if (hasReturnedRef.current) void refreshSignedInScreen(() => startTransition(() => router.refresh()));
      }
      if (isVisibleRef.current && !hasReturnedRef.current) return;
      if (!isGone) failedSaves.set(formKey, { draft, message });
      saveNoticeStore.add({
        formKey,
        isFailure: true,
        title: `${subject} 저장하지 못했어요`,
        description: isGone ? message : "쓴 내용은 그대로 있어요",
        href: formHrefRef.current,
      });
    },
  };
};

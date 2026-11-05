import { useRouter } from "next/navigation";
import { startTransition, useLayoutEffect, useRef, useState } from "react";
import { isWritingPath, saveNoticeStore } from "./save-notices";
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

interface FinishSavedParams {
  /** 저장한 내용을 보여 주는 화면 */
  href: string;
  /** 폼을 처음 상태로 되돌린다. 숨겨진 폼을 다시 열었을 때 같은 내용을 또 저장하지 않게 한다 */
  reset: () => void;
}

interface FinishFailedParams<Draft> extends FailedSave<Draft> {
  /** 고치는 대상이 이미 지워졌는지. 돌아가도 고칠 폼이 없으므로 내용을 보관하지 않고 그 이유를 알린다 */
  isGone?: boolean;
}

interface LeavableSave<Draft> {
  /** 지난번 실패로 보관된 내용. 있으면 폼의 처음 값으로 쓴다 */
  failedSave: FailedSave<Draft> | undefined;
  /** 저장을 시작할 때 부른다 */
  beginSave: () => void;
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
 * @example
 * const { failedSave, beginSave, finishSaved, finishFailed } = useLeavableSave({ formKey: "todo:new", subject: "하고 싶은 것을", failedSaves });
 */
export const useLeavableSave = <Draft>({ formKey, subject, failedSaves }: UseLeavableSaveParams<Draft>): LeavableSave<Draft> => {
  const router = useRouter();
  const [failedSave] = useState(() => failedSaves.get(formKey));
  const isVisibleRef = useRef(false);
  const formHrefRef = useRef("");

  useLayoutEffect(() => {
    isVisibleRef.current = true;
    // 폼에 돌아왔으니 알림이 머리글을 가릴 이유가 없다. 보관한 내용도 한 번만 채워, 쓰지 않기로 하면 다음에는 빈 폼을 연다
    failedSaves.delete(formKey);
    saveNoticeStore.clearForm(formKey);
    return () => {
      isVisibleRef.current = false;
    };
  }, [failedSaves, formKey]);

  /** 폼은 다시 불러오면 쓰던 내용이 사라지므로, 다른 폼을 쓰는 중이면 그 폼에서 뒤로 나갈 때 불러온다. 링크로 옮기면 어차피 새로 불러온다 */
  const refreshOutsideForm = () => {
    if (!isWritingPath(window.location.pathname)) {
      router.refresh();
      return;
    }
    const handlePopState = () => {
      if (isWritingPath(window.location.pathname)) return;
      window.removeEventListener("popstate", handlePopState);
      startTransition(() => router.refresh());
    };
    window.addEventListener("popstate", handlePopState);
  };

  return {
    failedSave,
    beginSave: () => {
      formHrefRef.current = `${window.location.pathname}${window.location.search}`;
    },
    finishSaved: ({ href, reset }) => {
      const isVisible = isVisibleRef.current;
      startTransition(() => {
        if (isVisible) {
          router.replace(href, { transitionTypes: BACK_TRANSITION });
          router.refresh();
        } else {
          refreshOutsideForm();
        }
        reset();
      });
      if (!isVisible) saveNoticeStore.add({ formKey, isFailure: false, title: `${subject} 저장했어요`, href });
    },
    finishFailed: ({ draft, message, isGone = false }) => {
      if (isVisibleRef.current) return;
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

import { useRouter } from "next/navigation";
import { startTransition, useLayoutEffect, useRef } from "react";
import { refreshOutsideForm } from "./refresh-outside-form";
import { saveNoticeStore } from "./save-notices";

interface UseLeavableDeleteParams {
  /** 무엇을 지우는지 구분하는 알림 key. 지우는 대상마다 정해진 값을 쓴다. 예: `delete:record:${recordId}` */
  noticeKey: string;
  /** 알림에 쓰는 이름. 받침에 맞는 조사까지 적는다. 예: "기록을", "커플 사진을" */
  subject: string;
}

interface LeavableDelete {
  /** 지우기를 시작할 때 부른다 */
  beginDelete: () => void;
  /**
   * 지우기가 끝나면 부른다. 화면을 보고 있으면 true를 돌려주고, 부른 쪽이 평소처럼 목록으로 옮긴다.
   * 떠났으면 지금 보는 화면에 그대로 두고(목록으로 끌고 가지 않는다) 화면을 새로 받은 뒤 알리고 false를 돌려준다.
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

/**
 * 지우는 사이 다른 화면으로 옮겨도(아이폰 가장자리 밀기 등) 결과를 알리고 끌고 오지 않는 도우미(#261).
 * 저장의 `useLeavableSave`와 같이, 화면이 숨겨지면(Activity) layout effect가 정리되는 것으로 지금 이 화면을 보고 있는지 안다.
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

  useLayoutEffect(() => {
    isVisibleRef.current = true;
    // 실패 알림의 "돌아가기"나 뒤로 가기로 돌아왔으니 알림이 머리글을 가릴 이유가 없다
    saveNoticeStore.clearForm(noticeKey);
    return () => {
      isVisibleRef.current = false;
    };
  }, [noticeKey]);

  return {
    beginDelete: () => {
      // 돌아온 화면에서 다시 지우면 지난 실패 알림은 더 이상 맞지 않는다
      saveNoticeStore.clearForm(noticeKey);
      startHrefRef.current = `${window.location.pathname}${window.location.search}`;
    },
    finishDeleted: () => {
      if (isVisibleRef.current) return true;
      // 지금 보는 목록에 지운 항목이 남아 있을 수 있다. 다른 폼을 쓰는 중이면 쓰던 내용이 사라지므로 돌아갈 때로 미룬다
      refreshOutsideForm(() => startTransition(() => router.refresh()));
      saveNoticeStore.add({ formKey: noticeKey, isFailure: false, title: `${subject} 지웠어요` });
      return false;
    },
    finishDeleteFailed: (canShowHere) => {
      const isVisible = isVisibleRef.current;
      if (isVisible && canShowHere) return true;
      saveNoticeStore.add({
        formKey: noticeKey,
        isFailure: true,
        title: `${subject} 지우지 못했어요`,
        description: isVisible ? "잠시 후 다시 시도해 주세요" : "돌아가서 다시 시도해 주세요",
        // 이미 그 화면에 있으면 돌아갈 곳이 없다
        href: isVisible ? undefined : startHrefRef.current,
      });
      return false;
    },
  };
};

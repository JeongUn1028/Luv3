"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, type MouseEvent, type ReactElement, type ReactNode } from "react";
import { ModalActions, ModalDialog, type ModalDialogHandle } from "@/components/ModalDialog";
import { goBackInHistory } from "@/lib/navigation/history-back";
import { BACK_TRANSITION } from "@/lib/navigation/transition";

interface BackLinkProps {
  /** 앱 안에 돌아갈 화면이 없을 때(주소로 바로 들어옴, 다른 앱에서 들어옴) 갈 주소 */
  href: string;
  /** 돌아갈 화면이 있어도 정해진 주소로 간다(앞 화면이 이미 없어졌을 때) */
  skipsHistory?: boolean;
  /** 저장하지 않은 내용이 있으면 true. 누르면 버리고 나갈지 먼저 묻는다(#165) */
  shouldConfirmLeave?: boolean;
  className: string;
  children: ReactNode;
}

/**
 * 머리글의 뒤로 버튼. 앱 안에 이전 화면이 있으면 브라우저 뒤로 가기로 돌아가 숨겨 둔 화면을 그대로 보여 주고, 없으면 정해진 주소로 간다.
 * 어디로 돌아갈지는 눌러 봐야 알 수 있어 이름은 "뒤로"로 둔다.
 * 폼에 저장하지 않은 내용이 있으면 버리고 나갈지 묻는다. iOS 가장자리 밀기와 브라우저 뒤로 가기는 막지 못한다.
 *
 * @example <BackLink href="/records" className="size-11"><BackIcon /></BackLink>
 */
export const BackLink = ({ href, skipsHistory = false, shouldConfirmLeave = false, className, children }: BackLinkProps): ReactElement => {
  const router = useRouter();
  const modalRef = useRef<ModalDialogHandle>(null);

  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    // 새 탭으로 열기는 브라우저에 맡긴다
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (shouldConfirmLeave) {
      event.preventDefault();
      modalRef.current?.open();
      return;
    }
    if (skipsHistory) return;
    if (goBackInHistory()) event.preventDefault();
  };

  const handleConfirmLeave = () => {
    // 창을 띄운 채 화면이 숨겨지면 앱을 막으므로, 옮기기 전에 바로 닫는다(#155)
    modalRef.current?.closeImmediately();
    if (!skipsHistory && goBackInHistory()) return;
    router.push(href, { transitionTypes: BACK_TRANSITION });
  };

  return (
    <>
      <Link href={href} transitionTypes={BACK_TRANSITION} aria-label="뒤로" className={className} onClick={handleClick}>
        {children}
      </Link>
      {shouldConfirmLeave && (
        <ModalDialog ref={modalRef} title="쓰던 내용을 버리고 나갈까요?" description="저장하지 않은 내용은 사라져요.">
          <ModalActions cancelLabel="계속 쓰기" onCancel={() => modalRef.current?.close()} confirmLabel="나가기" onConfirm={handleConfirmLeave} />
        </ModalDialog>
      )}
    </>
  );
};

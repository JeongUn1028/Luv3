"use client";

import Link from "next/link";
import { useEffect, useSyncExternalStore, type ReactElement } from "react";
import { saveNoticeStore, type SaveNotice } from "@/lib/navigation/save-notices";
import { FORWARD_TRANSITION } from "@/lib/navigation/transition";

/** 저장했다는 알림이 떠 있는 시간(ms). 실패 알림은 놓치지 않게 닫을 때까지 둔다 */
const SAVED_NOTICE_DURATION = 4000;

const NO_NOTICES: readonly SaveNotice[] = [];

const SaveNoticeItem = ({ notice }: { notice: SaveNotice }): ReactElement => {
  const { id, isFailure, title, description, href } = notice;

  useEffect(() => {
    if (isFailure) return;
    const timer = setTimeout(() => saveNoticeStore.dismiss(id), SAVED_NOTICE_DURATION);
    return () => clearTimeout(timer);
  }, [id, isFailure]);

  const dismiss = () => saveNoticeStore.dismiss(id);

  return (
    <div
      role={isFailure ? "alert" : "status"}
      className="pointer-events-auto flex items-center rounded-[10px] border border-line bg-surface py-1 pr-1 pl-4 text-ink shadow-lg"
    >
      <div className="min-w-0 flex-1 py-1">
        <p className={`text-[14px] ${isFailure ? "font-bold text-accent" : ""}`}>{title}</p>
        {description && <p className="mt-0.5 text-[12px] text-ink-sub">{description}</p>}
      </div>
      <Link href={href} transitionTypes={FORWARD_TRANSITION} onClick={dismiss} className="flex h-11 shrink-0 items-center px-3 text-[14px] font-bold text-accent">
        {isFailure ? "돌아가기" : "보기"}
      </Link>
      <button type="button" onClick={dismiss} className="h-11 shrink-0 px-3 text-[14px] text-ink-sub">
        닫기
      </button>
    </div>
  );
};

/**
 * 저장 중에 다른 화면으로 옮겼을 때 결과를 알린다. 어느 화면에서든 보이도록 루트 레이아웃에 둔다.
 *
 * @example <SaveNotices />
 */
export const SaveNotices = (): ReactElement => {
  const notices = useSyncExternalStore(saveNoticeStore.subscribe, saveNoticeStore.getNotices, () => NO_NOTICES);

  return (
    <div className="pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top)+8px)] z-10 mx-auto flex max-w-[430px] flex-col gap-2 px-4">
      {notices.map((notice) => (
        <SaveNoticeItem key={notice.id} notice={notice} />
      ))}
    </div>
  );
};

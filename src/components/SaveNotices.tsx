"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore, type Dispatch, type ReactElement, type SetStateAction } from "react";
import { saveNoticeStore, type SaveNotice } from "@/lib/navigation/save-notices";
import { FORWARD_TRANSITION } from "@/lib/navigation/transition";

/** 저장했다는 알림이 떠 있는 시간(ms). 실패 알림은 놓치지 않게 닫을 때까지 둔다 */
const SAVED_NOTICE_DURATION = 4000;
/** 알림이 사라지는 시간과 그 뒤 아래 알림이 올라오는 시간(ms). globals.css의 값과 같다 */
const NOTICE_LEAVE_STEP_MS = 170;

const NO_NOTICES: readonly SaveNotice[] = [];

type NoticePhase = "shown" | "leaving" | "collapsing";

const startLeaving = (id: string, setPhase: Dispatch<SetStateAction<NoticePhase>>): void => {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) saveNoticeStore.dismiss(id);
  // 이미 사라지는 중이면 그대로 둔다. 되돌리면 알림이 다시 나타났다 사라진다
  else setPhase((current) => (current === "shown" ? "leaving" : current));
};

const SaveNoticeItem = ({ notice }: { notice: SaveNotice }): ReactElement => {
  const { id, isFailure, title, description, href } = notice;
  const [phase, setPhase] = useState<NoticePhase>("shown");

  useEffect(() => {
    if (phase === "shown") return;
    const timer = setTimeout(() => {
      if (phase === "leaving") setPhase("collapsing");
      else saveNoticeStore.dismiss(id);
    }, NOTICE_LEAVE_STEP_MS);
    return () => clearTimeout(timer);
  }, [id, phase]);

  useEffect(() => {
    if (isFailure) return;
    const timer = setTimeout(() => startLeaving(id, setPhase), SAVED_NOTICE_DURATION);
    return () => clearTimeout(timer);
  }, [id, isFailure]);

  const handleDismiss = () => startLeaving(id, setPhase);

  return (
    <div data-phase={phase} className="save-notice-slot">
      <div>
        <div className="pb-2">
          <div
            data-save-notice
            role={isFailure ? "alert" : "status"}
            className="pointer-events-auto flex items-center rounded-[10px] border border-line bg-surface py-1 pr-1 pl-4 text-ink shadow-lg"
          >
            <div className="min-w-0 flex-1 py-1">
              <p className={`text-[14px] ${isFailure ? "font-display text-accent" : ""}`}>{title}</p>
              {description && <p className="mt-0.5 text-[12px] text-ink-sub">{description}</p>}
            </div>
            {href && (
              <Link href={href} transitionTypes={FORWARD_TRANSITION} onClick={handleDismiss} className="press-icon flex h-11 shrink-0 items-center px-3 font-display text-[14px] text-accent">
                {isFailure ? "돌아가기" : "보기"}
              </Link>
            )}
            <button type="button" onClick={handleDismiss} className="press-icon h-11 shrink-0 px-3 text-[14px] text-ink-sub">
              닫기
            </button>
          </div>
        </div>
      </div>
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
    <div className="pointer-events-none fixed inset-x-0 top-[calc(var(--overlay-top)+8px)] z-10 mx-auto flex max-w-[430px] flex-col px-4">
      {notices.map((notice) => (
        <SaveNoticeItem key={notice.id} notice={notice} />
      ))}
    </div>
  );
};

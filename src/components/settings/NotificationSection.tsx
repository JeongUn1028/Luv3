"use client";

import type { ReactElement, ReactNode } from "react";
import { SkeletonBlock } from "@/components/Skeleton";
import type { PushStatus } from "@/lib/push/subscription";
import { usePushNotifications } from "./use-push-notifications";

/** 켜기 전 상태마다 칸 아래에 적는 설명. 켠 뒤에는 설명 칸 대신 종류별 스위치를 보여 준다 */
const STATUS_DESCRIPTION: Record<Exclude<PushStatus, "on">, string> = {
  checking: "켜 두면 상대가 남긴 기록·댓글·일정을 이 기기로 알려 드려요.",
  off: "켜 두면 상대가 남긴 기록·댓글·일정을 이 기기로 알려 드려요.",
  denied: "알림을 허용하지 않은 기기예요. 아이폰 설정 → 알림 → Luv3에서 알림 허용을 켠 뒤 다시 열어 주세요.",
  "needs-install": "홈 화면에 추가한 Luv3에서만 켤 수 있어요. Safari에서 공유 → 홈 화면에 추가를 누른 뒤 거기서 켜 주세요.",
  unsupported: "이 브라우저에서는 알림을 받을 수 없어요.",
};

const primaryButtonClassName = "press-wide mt-3 h-[52px] w-full rounded-[10px] bg-accent font-display text-[15px] text-background disabled:opacity-50";
const outlineButtonClassName = "press-wide mt-3 h-[51px] w-full rounded-[10px] border border-line text-[15px] text-ink hover:bg-surface disabled:opacity-50";

interface NotificationSectionProps {
  /** 알림 공개 키(`NEXT_PUBLIC_VAPID_PUBLIC_KEY`). 없으면 이 칸을 그리지 않는다 */
  publicKey: string;
  /** 켠 기기에서 보여 줄 종류별 스위치(#364). 설정을 서버에서 읽어야 해 화면이 Suspense로 감싸 넘긴다 */
  typeSwitches: ReactNode;
}

/**
 * 설정 화면의 알림 칸(#363). 기기마다 알림을 켜고 끄며, 켠 기기에서는 종류별 스위치(#364, 시안 4번 A)와 시험 알림을 보여 준다.
 *
 * @example {publicKey && <NotificationSection publicKey={publicKey} typeSwitches={<PushTypeSwitches initialSettings={settings} />} />}
 */
export const NotificationSection = ({ publicKey, typeSwitches }: NotificationSectionProps): ReactElement => {
  const { status, pending, notice, enable, disable, sendTest } = usePushNotifications(publicKey);
  const isBusy = pending !== undefined;

  return (
    <section aria-labelledby="settings-notifications" className="mb-8 flex flex-col">
      <div className="flex items-baseline gap-1 text-[13px]">
        <h2 id="settings-notifications" className="text-ink-sub">
          알림
        </h2>
        {/* 켠 뒤에는 설명 칸 대신 제목 옆에 받는 중이라고 적고 종류별 스위치를 보여 준다(시안 4번 A) */}
        {status === "on" && <span className="text-accent">· 이 기기에서 받는 중</span>}
      </div>
      {status === "on" ? (
        typeSwitches
      ) : (
        <div className="mt-2 rounded-[10px] bg-surface px-4 py-3">
          <p className="text-[15px] text-ink">이 기기에서 알림 받기</p>
          <p className="mt-1 text-[12px] leading-[1.6] text-ink-sub">{STATUS_DESCRIPTION[status]}</p>
        </div>
      )}
      {status === "checking" && <SkeletonBlock className="mt-3 h-[52px] rounded-[10px]" />}
      {status === "off" && (
        <button type="button" onClick={enable} disabled={isBusy} className={primaryButtonClassName}>
          {pending === "enable" ? "알림 켜는 중…" : "알림 켜기"}
        </button>
      )}
      {status === "on" && (
        <>
          <button type="button" onClick={sendTest} disabled={isBusy} className={outlineButtonClassName}>
            {pending === "test" ? "시험 알림 보내는 중…" : "시험 알림 보내기"}
          </button>
          <button type="button" onClick={disable} disabled={isBusy} className={outlineButtonClassName}>
            {pending === "disable" ? "알림 끄는 중…" : "이 기기에서 알림 끄기"}
          </button>
        </>
      )}
      {notice && (
        <p role={notice.tone === "error" ? "alert" : "status"} className={`mt-3 text-[13px] ${notice.tone === "error" ? "text-accent" : "text-ink-sub"}`}>
          {notice.text}
        </p>
      )}
    </section>
  );
};

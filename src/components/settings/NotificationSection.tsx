"use client";

import type { ReactElement } from "react";
import { SkeletonBlock } from "@/components/Skeleton";
import type { PushStatus } from "@/lib/push/subscription";
import { usePushNotifications } from "./use-push-notifications";

/** 상태마다 칸 아래에 적는 설명 */
const STATUS_DESCRIPTION: Record<PushStatus, string> = {
  checking: "켜 두면 이 기기로 알림을 받아요. 시험 알림으로 잘 오는지 확인할 수 있어요.",
  off: "켜 두면 이 기기로 알림을 받아요. 시험 알림으로 잘 오는지 확인할 수 있어요.",
  on: "이 기기에서 알림을 받고 있어요.",
  denied: "알림을 허용하지 않은 기기예요. 아이폰 설정 → 알림 → Luv3에서 알림 허용을 켠 뒤 다시 열어 주세요.",
  "needs-install": "홈 화면에 추가한 Luv3에서만 켤 수 있어요. Safari에서 공유 → 홈 화면에 추가를 누른 뒤 거기서 켜 주세요.",
  unsupported: "이 브라우저에서는 알림을 받을 수 없어요.",
};

const primaryButtonClassName = "press-wide mt-3 h-[52px] w-full rounded-[10px] bg-accent font-display text-[15px] text-background disabled:opacity-50";
const outlineButtonClassName = "press-wide mt-3 h-[51px] w-full rounded-[10px] border border-line text-[15px] text-ink hover:bg-surface disabled:opacity-50";

interface NotificationSectionProps {
  /** 알림 공개 키(`NEXT_PUBLIC_VAPID_PUBLIC_KEY`). 없으면 이 칸을 그리지 않는다 */
  publicKey: string;
}

/**
 * 설정 화면의 알림 칸(#363). 기기마다 알림을 켜고 끄며, 켠 기기에서는 시험 알림을 보낼 수 있다.
 * 종류별 끄고 켜기는 #364에서 이 칸에 더한다.
 *
 * @example {publicKey && <NotificationSection publicKey={publicKey} />}
 */
export const NotificationSection = ({ publicKey }: NotificationSectionProps): ReactElement => {
  const { status, pending, notice, enable, disable, sendTest } = usePushNotifications(publicKey);
  const isBusy = pending !== undefined;

  return (
    <section aria-labelledby="settings-notifications" className="mb-8 flex flex-col">
      <h2 id="settings-notifications" className="text-[13px] text-ink-sub">
        알림
      </h2>
      <div className="mt-2 rounded-[10px] bg-surface px-4 py-3">
        <p className="flex items-center justify-between gap-3 text-[15px] text-ink">
          이 기기에서 알림 받기
          {status === "on" && <span className="shrink-0 text-[13px] text-accent">받는 중</span>}
        </p>
        <p className="mt-1 text-[12px] leading-[1.6] text-ink-sub">{STATUS_DESCRIPTION[status]}</p>
      </div>
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

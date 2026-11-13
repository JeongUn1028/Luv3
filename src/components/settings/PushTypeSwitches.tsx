"use client";

import { useState, type ReactElement } from "react";
import { useResetOnHide } from "@/lib/navigation/use-reset-on-hide";
import { PUSH_NOTIFY_SWITCHES, type PushNotifySettings } from "@/lib/push/notify-settings";
import type { PartnerPushKind } from "@/lib/push/partner-push";
import { createClient } from "@/lib/supabase/client";

const SAVE_FAILED_MESSAGE = "알림 종류를 바꾸지 못했어요. 잠시 후 다시 시도해 주세요.";

interface PushTypeSwitchesProps {
  /** 서버에서 읽은 지금 설정. 누르면 바로 바꿔 그리고, 저장에 실패하면 되돌린다 */
  initialSettings: PushNotifySettings;
}

/**
 * 설정 화면 알림 칸의 종류별 스위치(#364, 시안 4번 A). 새 기록·댓글·새 일정 알림을 따로 끄고 켠다.
 * 설정은 사람마다 하나라 이 기기뿐 아니라 그 사람의 모든 기기에 적용된다.
 *
 * @example <PushTypeSwitches initialSettings={settings} />
 */
export const PushTypeSwitches = ({ initialSettings }: PushTypeSwitchesProps): ReactElement => {
  // 서버 값을 처음 값으로만 쓰고, 누른 결과는 저장 성공 전까지 먼저 그린다
  const [settings, setSettings] = useState(initialSettings);
  const [pendingKinds, setPendingKinds] = useState<ReadonlySet<PartnerPushKind>>(new Set());
  const [errorMessage, setErrorMessage] = useState<string>();
  useResetOnHide(() => setErrorMessage(undefined));

  const handleToggle = async (kind: PartnerPushKind) => {
    if (pendingKinds.has(kind)) return;
    const isEnabled = !settings[kind];
    setSettings((current) => ({ ...current, [kind]: isEnabled }));
    setPendingKinds((current) => new Set(current).add(kind));
    setErrorMessage(undefined);
    const { error } = await createClient().rpc("set_push_notify", { p_kind: kind, p_enabled: isEnabled });
    setPendingKinds((current) => {
      const next = new Set(current);
      next.delete(kind);
      return next;
    });
    if (!error) return;
    console.error(new Error("알림 종류를 바꾸지 못했습니다.", { cause: error }));
    setSettings((current) => ({ ...current, [kind]: !isEnabled }));
    setErrorMessage(SAVE_FAILED_MESSAGE);
  };

  return (
    <>
      <div className="mt-2 overflow-hidden rounded-[10px] bg-surface">
        {PUSH_NOTIFY_SWITCHES.map(({ kind, label }) => (
          // 줄 전체를 누를 수 있게 스위치 하나를 줄 크기로 만든다. 읽는 이름은 줄의 글자다
          <button
            key={kind}
            type="button"
            role="switch"
            aria-checked={settings[kind]}
            disabled={pendingKinds.has(kind)}
            onClick={() => handleToggle(kind)}
            className="flex min-h-[51px] w-full items-center justify-between gap-3 border-t border-line pr-3 pl-4 text-left text-[15px] text-ink first:border-t-0 disabled:opacity-70"
          >
            {label}
            <span
              aria-hidden="true"
              className={`relative h-[28px] w-[46px] shrink-0 rounded-full transition-colors ${settings[kind] ? "bg-accent" : "bg-line"}`}
            >
              <span
                className={`absolute top-[3px] size-[22px] rounded-full transition-[left] ${settings[kind] ? "left-[21px] bg-background" : "left-[3px] bg-ink-sub"}`}
              />
            </span>
          </button>
        ))}
      </div>
      {errorMessage && (
        <p role="alert" className="mt-3 text-[13px] text-accent">
          {errorMessage}
        </p>
      )}
    </>
  );
};

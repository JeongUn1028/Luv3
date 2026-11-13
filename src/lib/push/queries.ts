import "server-only";
import { createClient } from "@/lib/supabase/server";
import { toPushNotifySettings, type PushNotifySettings } from "./notify-settings";

/** 종류별 알림 설정을 읽지 못했을 때. 설정 화면은 스위치 자리에 문구와 다시 시도 버튼을 보여 준다 */
export class PushSettingsLoadError extends Error {
  constructor(options?: ErrorOptions) {
    super("알림 종류 설정을 불러오지 못했어요.", options);
    this.name = "PushSettingsLoadError";
  }
}

/**
 * 로그인한 사람의 종류별 알림 설정(#364). 각자 자기 행만 읽는다(RLS).
 *
 * @example const settings = await catchLoadError(getPushNotifySettings, PushSettingsLoadError);
 */
export const getPushNotifySettings = async (): Promise<PushNotifySettings> => {
  const supabase = await createClient();
  const { data, error } = await supabase.from("push_settings").select("notify_record, notify_comment, notify_event").maybeSingle();
  if (error) throw new PushSettingsLoadError({ cause: error });
  return toPushNotifySettings(data ?? undefined);
};

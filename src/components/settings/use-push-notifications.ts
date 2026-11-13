import { useEffect, useState, useSyncExternalStore } from "react";
import { useResetOnHide } from "@/lib/navigation/use-reset-on-hide";
import { deletePushSubscriptionRow } from "@/lib/push/device-subscription";
import {
  isIosDevice,
  isSameServerKey,
  toApplicationServerKey,
  toPushStatus,
  toPushSupport,
  toStoredSubscription,
  type PushStatus,
  type PushSupport,
} from "@/lib/push/subscription";
import { createClient } from "@/lib/supabase/client";

const SERVICE_WORKER_PATH = "/sw.js";
/** 서비스 워커가 켜지기를 기다리는 시간(ms). 설치가 멈추면 "켜는 중"에서 영영 벗어나지 못한다 */
const READY_TIMEOUT = 10_000;

export type PushAction = "enable" | "disable";

export interface PushNotificationsState {
  status: PushStatus;
  pending: PushAction | undefined;
  /** 켜기·끄기에 실패했을 때 보여 줄 문구 */
  errorMessage: string | undefined;
  enable: () => Promise<void>;
  disable: () => Promise<void>;
}

// 지원 여부는 기기마다 정해져 바뀌지 않아 구독할 것이 없다. 서버 렌더링에는 브라우저 API가 없어 "확인 중"으로 그린다
const subscribeNothing = () => () => undefined;
const readPushSupport = (): PushSupport =>
  toPushSupport({
    hasPushApi: "serviceWorker" in navigator && "PushManager" in window && "Notification" in window,
    isIos: isIosDevice({ userAgent: navigator.userAgent, maxTouchPoints: navigator.maxTouchPoints }),
    isStandalone: window.matchMedia("(display-mode: standalone)").matches,
  });
const readServerPushSupport = (): undefined => undefined;

// 이미 등록돼 있으면 같은 등록을 돌려준다. 고친 서비스 워커가 바로 퍼지게 HTTP 저장본을 쓰지 않는다
const registerServiceWorker = () => navigator.serviceWorker.register(SERVICE_WORKER_PATH, { scope: "/", updateViaCache: "none" });

const saveSubscription = async (subscription: PushSubscription): Promise<void> => {
  const { endpoint, p256dh, auth } = toStoredSubscription(subscription.toJSON());
  const { error } = await createClient().rpc("save_push_subscription", { p_endpoint: endpoint, p_p256dh: p256dh, p_auth: auth });
  if (error) throw new Error(`알림 구독을 저장하지 못했습니다: ${error.message}`, { cause: error });
};

/** 서비스 워커가 켜지기를 기다리되, 정한 시간 안에 켜지지 않으면 실패로 본다 */
const waitForServiceWorker = (): Promise<ServiceWorkerRegistration> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("서비스 워커가 켜지지 않았습니다.")), READY_TIMEOUT);
  });
  return Promise.race([navigator.serviceWorker.ready, timeout]).finally(() => clearTimeout(timer));
};

/**
 * 설정 화면 알림 칸(#363)의 상태와 동작. 이 기기의 알림 허락·구독을 확인하고, 켜기·끄기를 맡는다.
 *
 * @example const { status, pending, errorMessage, enable, disable } = usePushNotifications(publicKey);
 */
export const usePushNotifications = (publicKey: string): PushNotificationsState => {
  const support = useSyncExternalStore(subscribeNothing, readPushSupport, readServerPushSupport);
  const [checkedStatus, setCheckedStatus] = useState<PushStatus>();
  const [pending, setPending] = useState<PushAction>();
  const [errorMessage, setErrorMessage] = useState<string>();
  useResetOnHide(() => setErrorMessage(undefined));

  // 브라우저에 남은 구독(외부 시스템)을 읽어 맞춘다. 다른 사람이 쓰던 기기이거나 서버에서 지워진 행이면 다시 저장해 이 사람 것으로 둔다
  useEffect(() => {
    if (support !== "supported") return;
    let isCancelled = false;
    const check = async () => {
      const registration = await registerServiceWorker();
      const subscription = await registration.pushManager.getSubscription();
      const isUsable = subscription !== null && isSameServerKey(subscription.options.applicationServerKey, toApplicationServerKey(publicKey));
      const permission = Notification.permission;
      if (isCancelled) return;
      setCheckedStatus(toPushStatus({ support, permission, hasSubscription: isUsable }));
      if (isUsable && permission === "granted") await saveSubscription(subscription);
    };
    check().catch((error: unknown) => {
      // 등록·저장에 실패해도 켜기 버튼에서 다시 시도할 수 있다
      console.error(new Error("알림 상태를 확인하지 못했습니다.", { cause: error }));
      if (!isCancelled) setCheckedStatus((current) => current ?? toPushStatus({ support, permission: Notification.permission, hasSubscription: false }));
    });
    return () => {
      isCancelled = true;
    };
  }, [support, publicKey]);

  const status: PushStatus = support === undefined ? "checking" : support !== "supported" ? support : (checkedStatus ?? "checking");

  const enable = async () => {
    if (pending) return;
    // 아이폰은 누른 순간에만 허락 창을 띄운다. 다른 기다림보다 먼저 부른다
    const permissionRequest = Notification.requestPermission();
    setPending("enable");
    setErrorMessage(undefined);
    try {
      const permission = await permissionRequest;
      if (permission !== "granted") {
        setCheckedStatus(permission === "denied" ? "denied" : "off");
        return;
      }
      await registerServiceWorker();
      const registration = await waitForServiceWorker();
      const serverKey = toApplicationServerKey(publicKey);
      const existing = await registration.pushManager.getSubscription();
      const isUsable = existing !== null && isSameServerKey(existing.options.applicationServerKey, serverKey);
      // 알림 열쇠를 바꾼 뒤의 예전 구독으로는 보낼 수 없어, 서버의 행을 지우고 끊은 뒤 새로 만든다
      if (existing && !isUsable) {
        await deletePushSubscriptionRow(existing.endpoint);
        await existing.unsubscribe();
      }
      const subscription = isUsable ? existing : await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: serverKey });
      await saveSubscription(subscription);
      setCheckedStatus("on");
    } catch (error) {
      console.error(new Error("알림을 켜지 못했습니다.", { cause: error }));
      setErrorMessage("알림을 켜지 못했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setPending(undefined);
    }
  };

  const disable = async () => {
    if (pending) return;
    setPending("disable");
    setErrorMessage(undefined);
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        // 서버의 행을 먼저 지운다. 끊기만 하고 행이 남으면 알림 서비스가 사라졌다고 답할 때까지 보내려 한다
        await deletePushSubscriptionRow(subscription.endpoint);
        await subscription.unsubscribe();
      }
      setCheckedStatus("off");
    } catch (error) {
      console.error(new Error("알림을 끄지 못했습니다.", { cause: error }));
      setErrorMessage("알림을 끄지 못했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setPending(undefined);
    }
  };

  return { status, pending, errorMessage, enable, disable };
};

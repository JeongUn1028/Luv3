import { useEffect, useState, useSyncExternalStore } from "react";
import { useResetOnHide } from "@/lib/navigation/use-reset-on-hide";
import { deletePushSubscriptionRow, savePushSubscriptionRow } from "@/lib/push/device-subscription";
import {
  isIosDevice,
  isPushServiceEndpoint,
  isRememberedServiceUnsupported,
  isUsableSubscription,
  PUSH_SERVICE_UNSUPPORTED_KEY,
  toApplicationServerKey,
  toPushStatus,
  toPushSupport,
  toUnsupportedServiceMemory,
  type PushStatus,
  type PushSupport,
} from "@/lib/push/subscription";

const SERVICE_WORKER_PATH = "/sw.js";
/** 서비스 워커가 켜지기를 기다리는 시간(ms). 설치가 멈추면 "켜는 중"에서 영영 벗어나지 못한다 */
const READY_TIMEOUT = 10_000;

export type PushAction = "enable" | "disable";

export interface PushNotice {
  tone: "info" | "error";
  text: string;
}

export interface PushNotificationsState {
  status: PushStatus;
  pending: PushAction | undefined;
  notice: PushNotice | undefined;
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

// 사생활 보호 모드 등에서는 저장소 접근이 막혀 예외가 난다. 그때는 기억하지 못한 것으로 보고, 켜기를 누르면 다시 확인한다
const readServiceUnsupported = (): boolean => {
  try {
    return isRememberedServiceUnsupported(window.localStorage.getItem(PUSH_SERVICE_UNSUPPORTED_KEY));
  } catch {
    return false;
  }
};

const rememberServiceUnsupported = (endpoint: string) => {
  try {
    window.localStorage.setItem(PUSH_SERVICE_UNSUPPORTED_KEY, toUnsupportedServiceMemory(endpoint));
  } catch {
    // 기억하지 못해도 이번 화면에는 안내가 보이고, 다음에 켜기를 누르면 같은 안내가 다시 나온다
  }
};

// 목록 안 구독이 생겼으면(브라우저가 알림 서비스를 바꿈 등) 받을 수 있는 브라우저라 기억을 지운다
const forgetServiceUnsupported = () => {
  try {
    window.localStorage.removeItem(PUSH_SERVICE_UNSUPPORTED_KEY);
  } catch {
    // 지우지 못하면 읽을 때도 막혀 있어 기억하지 않은 것으로 보인다
  }
};

/**
 * 구독 주소가 알림 서비스 목록 밖이면(#432) 기억해 두고 브라우저 구독을 끊는다. 서버는 그런 주소를 저장하지 않아 지울 행이 없다.
 * 구독이 남아 있으면 다시 열 때 "켜짐"으로 보이지만 알림은 오지 않는다. 끊기가 실패해도 안내는 보이도록 먼저 기억한다.
 */
const dropUnsupportedSubscription = async (subscription: PushSubscription | null): Promise<boolean> => {
  if (!subscription) return false;
  if (isPushServiceEndpoint(subscription.endpoint)) {
    forgetServiceUnsupported();
    return false;
  }
  rememberServiceUnsupported(subscription.endpoint);
  await subscription.unsubscribe();
  return true;
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
 * @example const { status, pending, notice, enable, disable } = usePushNotifications(publicKey);
 */
export const usePushNotifications = (publicKey: string): PushNotificationsState => {
  const support = useSyncExternalStore(subscribeNothing, readPushSupport, readServerPushSupport);
  const [checkedStatus, setCheckedStatus] = useState<PushStatus>();
  const [pending, setPending] = useState<PushAction>();
  const [notice, setNotice] = useState<PushNotice>();
  useResetOnHide(() => setNotice(undefined));

  // 브라우저에 남은 구독(외부 시스템)을 읽어 맞춘다. 다른 사람이 쓰던 기기이거나 서버에서 지워진 행이면 다시 저장해 이 사람 것으로 둔다
  useEffect(() => {
    if (support !== "supported") return;
    let isCancelled = false;
    const check = async () => {
      const registration = await registerServiceWorker();
      const found = await registration.pushManager.getSubscription();
      const subscription = (await dropUnsupportedSubscription(found)) ? null : found;
      const isUsable = isUsableSubscription(subscription, toApplicationServerKey(publicKey));
      const permission = Notification.permission;
      if (isCancelled) return;
      setCheckedStatus(toPushStatus({ support, permission, hasSubscription: isUsable, isServiceUnsupported: readServiceUnsupported() }));
      if (subscription && isUsable && permission === "granted") await savePushSubscriptionRow(subscription);
    };
    check().catch((error: unknown) => {
      // 등록·저장에 실패해도 켜기 버튼에서 다시 시도할 수 있다
      console.error(new Error("알림 상태를 확인하지 못했습니다.", { cause: error }));
      if (!isCancelled) {
        setCheckedStatus(
          (current) => current ?? toPushStatus({ support, permission: Notification.permission, hasSubscription: false, isServiceUnsupported: readServiceUnsupported() }),
        );
      }
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
    setNotice(undefined);
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
      const isUsable = isUsableSubscription(existing, serverKey);
      // 알림 열쇠를 바꾼 뒤의 예전 구독으로는 보낼 수 없어, 서버의 행을 지우고 끊은 뒤 새로 만든다
      if (existing && !isUsable) {
        await deletePushSubscriptionRow(existing.endpoint);
        await existing.unsubscribe();
      }
      const subscription = existing && isUsable ? existing : await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: serverKey });
      // 알림 서비스 목록 밖 브라우저는 저장이 늘 거절돼 "다시 시도"가 소용없다. 끊고 받을 수 없다고 보여 준다(#432)
      if (await dropUnsupportedSubscription(subscription)) {
        setCheckedStatus("unsupported");
        return;
      }
      await savePushSubscriptionRow(subscription);
      setCheckedStatus("on");
    } catch (error) {
      console.error(new Error("알림을 켜지 못했습니다.", { cause: error }));
      setNotice({ tone: "error", text: "알림을 켜지 못했어요. 잠시 후 다시 시도해 주세요." });
    } finally {
      setPending(undefined);
    }
  };

  const disable = async () => {
    if (pending) return;
    setPending("disable");
    setNotice(undefined);
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
      setNotice({ tone: "error", text: "알림을 끄지 못했어요. 잠시 후 다시 시도해 주세요." });
    } finally {
      setPending(undefined);
    }
  };

  return { status, pending, notice, enable, disable };
};

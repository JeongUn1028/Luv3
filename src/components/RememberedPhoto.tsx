"use client";

import { useSyncExternalStore, type ReactElement } from "react";
import { SignedPhoto, type SignedPhotoProps } from "@/components/SignedPhoto";
import {
  forgetPhotoUrl,
  parseRememberedUrls,
  pickPhotoUrl,
  REMEMBERED_PHOTO_URLS_KEY,
  rememberPhotoUrl,
  type RememberablePhoto,
  type RememberedUrls,
} from "@/lib/photos/remembered-url";

const listeners = new Set<() => void>();
// 저장소를 한 번만 읽고 이 값을 기준으로 삼는다. 저장이 실패해도(용량 초과 등) 잊은 주소를 다시 그리지 않는다
let rememberedCache: RememberedUrls | undefined;

const notify = () => {
  for (const listener of listeners) listener();
};

// 다른 창(홈 화면 앱과 브라우저)에서 바꾼 기억도 따른다
const handleStorage = (event: StorageEvent) => {
  if (event.key !== REMEMBERED_PHOTO_URLS_KEY && event.key !== null) return;
  rememberedCache = undefined;
  notify();
};

const subscribe = (listener: () => void) => {
  if (listeners.size === 0) window.addEventListener("storage", handleStorage);
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) window.removeEventListener("storage", handleStorage);
  };
};

// 사생활 보호 모드 등에서는 저장소 접근이 막혀 예외가 난다. 그때는 기억 없이 서버가 준 주소를 쓴다
const readStoredUrls = (): RememberedUrls => {
  try {
    return parseRememberedUrls(window.localStorage.getItem(REMEMBERED_PHOTO_URLS_KEY));
  } catch {
    return {};
  }
};

const readRemembered = (): RememberedUrls => {
  rememberedCache ??= readStoredUrls();
  return rememberedCache;
};

const updateRemembered = (update: (remembered: RememberedUrls) => RememberedUrls): void => {
  rememberedCache = update(readRemembered());
  try {
    window.localStorage.setItem(REMEMBERED_PHOTO_URLS_KEY, JSON.stringify(rememberedCache));
  } catch {
    // 저장하지 못하면 다음에 앱을 켤 때 서버가 준 주소로 받을 뿐이다
  }
  notify();
};

/**
 * 휴대폰이 기억한 사진 주소를 모두 잊는다. 7일 동안 쓸 수 있는 주소라, 로그아웃한 기기에 남기지 않는다.
 *
 * @example forgetAllPhotoUrls()
 */
export const forgetAllPhotoUrls = (): void => {
  rememberedCache = {};
  try {
    window.localStorage.removeItem(REMEMBERED_PHOTO_URLS_KEY);
  } catch {
    // 저장소를 쓸 수 없으면 기억한 주소도 없다
  }
  notify();
};

// 서버가 처음 보내는 화면에 주소가 있으면 기억한 주소로 바꾸기 전에 받기 시작해 두 번 받으므로, 화면이 연결된 뒤에 정한다
const getServerSnapshot = (): undefined => undefined;

interface RememberedPhotoProps extends Omit<SignedPhotoProps, "src" | "onLoad" | "onLoadFailed"> {
  photo: RememberablePhoto;
}

/**
 * 휴대폰이 기억한 주소로 그리는 홈 사진(#219). 서버는 새로 뜰 때마다 새 주소를 줘, 주소가 바뀌면 휴대폰이 저장해 둔 사진을 쓰지 않고 다시 받는다.
 * 같은 경로의 기억한 주소가 아직 쓸 수 있으면 그 주소로 그리고, 받은 주소를 경로로 기억한다. 사진을 바꾸면 경로가 달라져 새 사진을 바로 그린다.
 * 기억한 주소로 받지 못하면 잊고 서버가 준 주소로 다시 받는다. 그것도 실패하면 `SignedPhoto`가 화면을 새로 받는다.
 *
 * @example <RememberedPhoto photo={record.thumb} alt="" className="size-full object-cover" />
 */
export const RememberedPhoto = ({ photo, ...props }: RememberedPhotoProps): ReactElement | null => {
  const src = useSyncExternalStore(subscribe, () => pickPhotoUrl(photo, readRemembered(), Date.now()), getServerSnapshot);
  if (src === undefined) return null;

  const isServerUrl = src === photo.url;

  const handleLoad = () => {
    if (isServerUrl) updateRemembered((remembered) => rememberPhotoUrl(remembered, photo, Date.now()));
  };

  const handleLoadFailed = (): boolean => {
    if (isServerUrl) return false;
    updateRemembered((remembered) => forgetPhotoUrl(remembered, photo.path));
    return true;
  };

  return <SignedPhoto src={src} onLoad={handleLoad} onLoadFailed={handleLoadFailed} {...props} />;
};

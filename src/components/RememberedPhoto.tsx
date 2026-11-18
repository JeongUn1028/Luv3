"use client";

import { useState, useSyncExternalStore, type ReactElement } from "react";
import { SignedPhoto, type SignedPhotoProps } from "@/components/SignedPhoto";
import {
  decodeHomePhotoCookie,
  forgetHomePhoto,
  HOME_PHOTO_COOKIE,
  rememberHomePhoto,
  toHomePhotoCookieString,
  type HomePhotoCookie,
  type HomePhotoSlot,
} from "@/lib/photos/home-photo-cookie";
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

// 받지 못해 잊은 주소. 받아 둔 화면(#405)을 다시 그려 서버가 고른 주소가 또 와도 그 주소로 다시 받지 않는다
const failedUrls = new Set<string>();

const readHomePhotoCookie = (): HomePhotoCookie => {
  const entry = document.cookie.split("; ").find((part) => part.startsWith(`${HOME_PHOTO_COOKIE}=`));
  return decodeHomePhotoCookie(entry?.slice(HOME_PHOTO_COOKIE.length + 1));
};

// 쿠키를 쓸 수 없는 곳(일부 내장 브라우저)에서는 다음에 서버가 HTML에 넣지 못할 뿐이다
const writeHomePhotoCookie = (update: (cookie: HomePhotoCookie) => HomePhotoCookie): void => {
  try {
    document.cookie = toHomePhotoCookieString(update(readHomePhotoCookie()), { isSecure: window.location.protocol === "https:" });
  } catch {
    // 저장소와 같이 조용히 넘어간다
  }
};

/**
 * 휴대폰이 기억한 사진 주소를 모두 잊는다(홈 사진 쿠키 포함). 7일 동안 쓸 수 있는 주소라, 로그아웃한 기기에 남기지 않는다.
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
  failedUrls.clear();
  writeHomePhotoCookie(() => ({}));
  notify();
};

// 서버가 처음 보내는 화면에 주소가 있으면 기억한 주소로 바꾸기 전에 받기 시작해 두 번 받으므로, 화면이 연결된 뒤에 정한다.
// 홈 사진은 서버가 쿠키로 고른 주소(`serverSrc`)를 넘겨 처음부터 그린다
const getServerSnapshot = (): undefined => undefined;

interface RememberedPhotoProps extends Omit<SignedPhotoProps, "src" | "onLoad"> {
  photo: RememberablePhoto;
  /**
   * 홈 사진 칸. 주어지면 받은 주소를 쿠키에도 기억해, 다음에 서버가 HTML에 바로 넣게 한다(#356).
   * `serverSrc`와 함께 넘긴다
   */
  homeSlot?: HomePhotoSlot;
  /** 서버가 쿠키를 보고 고른 주소(`pickHomePhotoSrc`). 휴대폰 저장소를 읽기 전에도 이 주소로 그린다 */
  serverSrc?: string;
}

/**
 * 휴대폰이 기억한 주소로 그리는 사진(홈 #219, 기록 그리드·상세 #354). 서버는 새로 뜰 때마다 새 주소를 줘, 주소가 바뀌면 휴대폰이 저장해 둔 사진을 쓰지 않고 다시 받는다.
 * 같은 경로의 기억한 주소가 아직 쓸 수 있으면 그 주소로 그리고, 받은 주소를 경로로 기억한다. 사진을 바꾸면 경로가 달라져 새 사진을 바로 그린다.
 * 기억한 주소로 받지 못하면 잊고 서버가 준 주소로 다시 받는다. 서버 주소도 받지 못하면 `onLoadFailed`를 부르고, 그것이 true를 돌려주지 않으면 `SignedPhoto`가 화면을 새로 받는다.
 * 홈 사진은 서버가 쿠키로 고른 주소를 HTML에 넣어 화면 코드가 뜨기 전에 받기 시작한다(#356).
 *
 * @example <RememberedPhoto photo={record.thumb} alt="" className="size-full object-cover" />
 */
export const RememberedPhoto = ({ photo, homeSlot, serverSrc, onLoadFailed, onLoaded, ...props }: RememberedPhotoProps): ReactElement | null => {
  const pickedSrc = useSyncExternalStore(subscribe, () => pickPhotoUrl(photo, readRemembered(), Date.now()), getServerSnapshot);
  // 다 받은 사진은 그 주소로 계속 둔다. 기억한 주소가 다시 쓰는 기준 시간 아래로 내려가도, 이미 보이는 사진을 새 주소로 다시 받지 않는다.
  // 받지 못한 기억한 주소 대신 서버 주소로 바꿀 때도 여기에 둔다
  const [settled, setSettled] = useState<{ path: string; src: string }>();
  // 서버가 고른 주소는 휴대폰 저장소의 기억과 달라도 그대로 쓴다. 바꾸면 이미 받기 시작한 사진을 두고 또 받는다
  const usableServerSrc = serverSrc !== undefined && !failedUrls.has(serverSrc) ? serverSrc : undefined;
  const src = settled?.path === photo.path ? settled.src : (usableServerSrc ?? pickedSrc);
  if (src === undefined) return null;

  const isServerUrl = src === photo.url;

  // 서버가 그린 사진은 화면이 연결되기 전에 다 받을 수 있어 onLoad 대신 놓치지 않는 onLoaded로 기억한다
  const handleLoaded = (image: HTMLImageElement) => {
    onLoaded?.(image);
    // 서버가 그린 사진은 붙을 때와 onLoad에서 두 번 알릴 수 있다. 기억은 한 번만 쓴다
    if (settled?.path === photo.path && settled.src === src) return;
    setSettled({ path: photo.path, src });
    if (isServerUrl) {
      updateRemembered((remembered) => rememberPhotoUrl(remembered, photo, Date.now()));
      if (homeSlot) writeHomePhotoCookie((cookie) => rememberHomePhoto(cookie, homeSlot, photo));
    }
  };

  const handleLoadFailed = (): boolean => {
    if (isServerUrl) return onLoadFailed?.() ?? false;
    failedUrls.add(src);
    updateRemembered((remembered) => forgetPhotoUrl(remembered, photo.path));
    if (homeSlot) writeHomePhotoCookie((cookie) => forgetHomePhoto(cookie, homeSlot));
    setSettled({ path: photo.path, src: photo.url });
    return true;
  };

  return <SignedPhoto src={src} onLoaded={handleLoaded} onLoadFailed={handleLoadFailed} {...props} />;
};

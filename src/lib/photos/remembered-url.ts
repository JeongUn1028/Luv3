import { SIGNED_URL_MIN_REMAINING } from "./limits";
import type { SignedUrlWithExpiry } from "./signed-urls";

/** 휴대폰이 기억한 사진 주소를 저장하는 `localStorage` 키 */
export const REMEMBERED_PHOTO_URLS_KEY = "luv3:remembered-photo-urls";

/** 휴대폰이 경로로 기억해 다시 쓸 수 있는 사진 주소(홈 사진) */
export interface RememberablePhoto {
  /** album 버킷 안의 경로. 사진을 바꾸면 경로가 달라진다 */
  path: string;
  /** 서버가 이번에 준 서명 주소 */
  url: string;
  /** 그 주소가 만료되는 시각(ms) */
  expiresAt: number;
}

/** 기억한 주소 하나 */
export interface RememberedUrl {
  url: string;
  expiresAt: number;
}

/** 경로별로 기억한 주소 */
export type RememberedUrls = Record<string, RememberedUrl>;

// 화면을 열어 두는 동안 만료되지 않게, 서버가 보관한 주소를 다시 쓸 때와 같은 시간을 남긴다
const isUsable = ({ expiresAt }: RememberedUrl, now: number): boolean => expiresAt - now >= SIGNED_URL_MIN_REMAINING * 1000;

const isRememberedUrl = (value: unknown): value is RememberedUrl =>
  typeof value === "object" && value !== null && typeof Reflect.get(value, "url") === "string" && typeof Reflect.get(value, "expiresAt") === "number";

/**
 * 저장해 둔 글자를 기억한 주소로 읽는다. 없거나 깨졌거나 모양이 다른 항목은 버린다.
 *
 * @example parseRememberedUrls(localStorage.getItem(REMEMBERED_PHOTO_URLS_KEY))
 */
export const parseRememberedUrls = (raw: string | null): RememberedUrls => {
  if (raw === null) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};
  return Object.fromEntries(Object.entries(parsed).filter((entry): entry is [string, RememberedUrl] => isRememberedUrl(entry[1])));
};

/**
 * 그릴 주소를 고른다. 같은 경로의 기억한 주소가 아직 쓸 수 있으면 그 주소를, 아니면 서버가 준 주소를 쓴다.
 * 주소가 같아야 휴대폰이 저장해 둔 사진을 다시 받지 않고 쓴다.
 *
 * @example pickPhotoUrl(photo, parseRememberedUrls(raw), Date.now()) // "https://.../a.jpg?token=old"
 */
export const pickPhotoUrl = (photo: RememberablePhoto, remembered: RememberedUrls, now: number): string => {
  const entry = remembered[photo.path];
  return entry && isUsable(entry, now) ? entry.url : photo.url;
};

/**
 * 받은 사진의 주소를 경로로 기억한다. 쓸 수 없게 된 주소는 함께 지워 저장소가 쌓이지 않게 한다.
 *
 * @example rememberPhotoUrl(remembered, photo, Date.now())
 */
export const rememberPhotoUrl = (remembered: RememberedUrls, photo: RememberablePhoto, now: number): RememberedUrls => ({
  ...Object.fromEntries(Object.entries(remembered).filter(([, entry]) => isUsable(entry, now))),
  [photo.path]: { url: photo.url, expiresAt: photo.expiresAt },
});

/**
 * 받지 못한 주소를 잊어, 다음에는 서버가 준 주소를 쓰게 한다.
 *
 * @example forgetPhotoUrl(remembered, photo.path)
 */
export const forgetPhotoUrl = (remembered: RememberedUrls, path: string): RememberedUrls =>
  Object.fromEntries(Object.entries(remembered).filter(([key]) => key !== path));

/**
 * 보관 함수의 서명 결과를 휴대폰이 기억할 수 있는 사진 주소로 바꾼다.
 *
 * @returns 서명하지 못했으면 undefined
 * @example toRememberablePhoto(signed.find(({ path }) => path === thumbPath))
 */
export const toRememberablePhoto = (signed: SignedUrlWithExpiry | undefined): RememberablePhoto | undefined =>
  signed?.path && signed.signedUrl && signed.expiresAt !== undefined ? { path: signed.path, url: signed.signedUrl, expiresAt: signed.expiresAt } : undefined;

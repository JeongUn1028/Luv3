import { isObject } from "@/lib/guards";
import { HOME_PHOTO_URL_EXPIRES_IN } from "./limits";
import { isRememberablePhoto, pickPhotoUrl, type RememberablePhoto } from "./remembered-url";

/**
 * 홈 사진 두 칸의 기억한 주소를 담는 쿠키. 휴대폰 저장소(localStorage)는 서버가 읽지 못해 화면 코드가 뜬 뒤에야 사진을 받기 시작하므로,
 * 홈 사진만 쿠키에도 적어 서버가 처음 보내는 HTML에 주소를 넣는다(#356). 기록 그리드·상세는 사진이 많아 쿠키 한도(4KB)를 넘어 넣지 않는다
 */
export const HOME_PHOTO_COOKIE = "luv3-home-photos";

/** 쿠키에 기억하는 홈 사진 칸: 커플 사진, 최근 데이트 */
export const HOME_PHOTO_SLOTS = ["couple", "latest"] as const;

export type HomePhotoSlot = (typeof HOME_PHOTO_SLOTS)[number];

/** 칸별로 기억한 사진(경로·주소·만료 시각) */
export type HomePhotoCookie = Partial<Record<HomePhotoSlot, RememberablePhoto>>;

const isHomePhotoSlot = (key: string): key is HomePhotoSlot => HOME_PHOTO_SLOTS.some((slot) => slot === key);

/**
 * 이미 풀린 쿠키 값(JSON 글자)을 칸별 기억한 사진으로 읽는다. 없거나 깨졌거나 모양이 다른 칸은 버린다.
 * Next의 `cookies().get()`은 값을 이미 풀어 주므로 그 값을 그대로 넘긴다. 다시 풀면 주소 안의 `%` 표기가 바뀐다
 *
 * @example parseHomePhotoCookie((await cookies()).get(HOME_PHOTO_COOKIE)?.value)
 */
export const parseHomePhotoCookie = (json: string | undefined): HomePhotoCookie => {
  if (json === undefined) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return {};
  }
  if (!isObject(parsed)) return {};
  return Object.fromEntries(
    Object.entries(parsed).filter((entry): entry is [HomePhotoSlot, RememberablePhoto] => isHomePhotoSlot(entry[0]) && isRememberablePhoto(entry[1])),
  );
};

/**
 * `document.cookie`처럼 아직 풀지 않은 쿠키 값을 읽는다. 깨진 `%` 표기면 빈 기억으로 본다.
 *
 * @example decodeHomePhotoCookie(rawValue)
 */
export const decodeHomePhotoCookie = (raw: string | undefined): HomePhotoCookie => {
  if (raw === undefined) return {};
  try {
    return parseHomePhotoCookie(decodeURIComponent(raw));
  } catch {
    return {};
  }
};

/**
 * 서버가 HTML에 넣을 사진 주소를 고른다. 같은 경로를 기억했고 아직 쓸 수 있을 때만 그 주소를 준다.
 * 기억이 없으면 넣지 않고 지금처럼 휴대폰 저장소를 읽은 뒤 그린다. 쿠키가 아직 없는 기기(배포 직후, 쿠키를 지운 기기)가
 * 저장소에 기억한 주소를 두고 서버의 새 주소로 사진을 또 받지 않게 한다(#219)
 *
 * @returns 쓸 수 있는 기억이 없으면 undefined
 * @example pickHomePhotoSrc(photo, parseHomePhotoCookie(value).couple, Date.now())
 */
export const pickHomePhotoSrc = (photo: RememberablePhoto, remembered: RememberablePhoto | undefined, now: number): string | undefined => {
  if (remembered?.path !== photo.path) return undefined;
  const picked = pickPhotoUrl(photo, { [remembered.path]: remembered }, now);
  return picked === remembered.url ? picked : undefined;
};

/**
 * 받은 사진을 그 칸에 기억한다.
 *
 * @example rememberHomePhoto(cookie, "couple", photo)
 */
export const rememberHomePhoto = (cookie: HomePhotoCookie, slot: HomePhotoSlot, photo: RememberablePhoto): HomePhotoCookie => ({ ...cookie, [slot]: photo });

/**
 * 받지 못한 칸의 기억을 지운다.
 *
 * @example forgetHomePhoto(cookie, "latest")
 */
export const forgetHomePhoto = (cookie: HomePhotoCookie, slot: HomePhotoSlot): HomePhotoCookie =>
  Object.fromEntries(Object.entries(cookie).filter(([key]) => key !== slot));

/**
 * 브라우저가 `document.cookie`에 쓸 글자를 만든다. 홈 사진 주소가 쓸 수 있는 동안(7일)만 남기고, 기억이 비면 지운다.
 *
 * @param isSecure https면 true. 로컬 http에서는 Secure 쿠키를 쓸 수 없다
 * @example document.cookie = toHomePhotoCookieString(cookie, { isSecure: location.protocol === "https:" })
 */
export const toHomePhotoCookieString = (cookie: HomePhotoCookie, { isSecure }: { isSecure: boolean }): string => {
  const isEmpty = Object.keys(cookie).length === 0;
  const value = isEmpty ? "" : encodeURIComponent(JSON.stringify(cookie));
  const maxAge = isEmpty ? 0 : HOME_PHOTO_URL_EXPIRES_IN;
  return `${HOME_PHOTO_COOKIE}=${value}; Path=/; Max-Age=${maxAge}; SameSite=Lax${isSecure ? "; Secure" : ""}`;
};

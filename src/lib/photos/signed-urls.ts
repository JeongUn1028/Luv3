import { HOME_PHOTO_URL_EXPIRES_IN, HOME_PHOTO_URL_MIN_REMAINING, SIGNED_URL_EXPIRES_IN, SIGNED_URL_MIN_REMAINING } from "./limits";

/** 경로 하나의 서명 결과. 서명하지 못한 경로는 `signedUrl`이 null이다 */
export interface SignedUrl {
  path: string | null;
  signedUrl: string | null;
}

/** 저장소의 서명 요청과 같은 모양의 결과. 요청 자체가 실패하면 `error`가 있다 */
export type SignedUrlsResult = { data: SignedUrl[]; error: null } | { data: null; error: Error };

/** 서명을 맡는 저장소 버킷. `supabase.storage.from(버킷)`이 이 모양이다 */
export interface SigningBucket {
  createSignedUrls: (paths: string[], expiresIn: number) => Promise<SignedUrlsResult>;
}

/** 보관 함수가 돌려주는 서명 결과. 휴대폰이 주소를 기억할 수 있게 만료 시각을 함께 준다 */
export interface SignedUrlWithExpiry extends SignedUrl {
  /** 주소가 만료되는 시각(ms). 서명하지 못했으면 undefined */
  expiresAt: number | undefined;
}

/** 보관 함수의 결과. 서명 요청 자체가 실패하면 `error`가 있다 */
export type CachedSignedUrlsResult = { data: SignedUrlWithExpiry[]; error: null } | { data: null; error: Error };

/** 요청한 경로 순서대로 서명 주소를 돌려준다. 다시 쓸 수 있는 주소는 서명하지 않는다 */
export type GetSignedUrls = (bucket: SigningBucket, paths: string[]) => Promise<CachedSignedUrlsResult>;

/** 서명 주소의 유효 시간과, 보관한 주소를 다시 쓸 때 남아 있어야 하는 시간(초) */
export interface SignedUrlLifetime {
  expiresIn: number;
  minRemaining: number;
}

const DEFAULT_LIFETIME: SignedUrlLifetime = { expiresIn: SIGNED_URL_EXPIRES_IN, minRemaining: SIGNED_URL_MIN_REMAINING };

interface CachedUrl {
  signedUrl: string;
  /** 주소가 만료되는 시각(ms) */
  expiresAt: number;
}

/**
 * 경로별 서명 주소를 만료 전까지 다시 쓰는 함수를 만든다. 서명 주소는 발급할 때마다 달라져서,
 * 그대로 두면 브라우저가 같은 사진도 새 파일로 여겨 다시 받는다.
 *
 * 로그인 확인은 경로를 얻는 쪽이 맡는다. 경로는 RLS가 걸린 표에서만 읽으므로 두 사람 말고는 이 함수에 닿을 경로가 없다.
 * 올린 파일은 덮어쓰지 않으므로 경로가 같으면 같은 사진이고, 지운 사진은 행이 사라져 경로를 읽을 수 없으므로 주소가 다시 나오지 않는다.
 * 보관은 경로만으로 구분하므로 만든 함수 하나는 버킷 하나에만 쓴다.
 *
 * @param now 현재 시각(ms). 테스트에서 시간을 옮길 때만 넘긴다
 * @param lifetime 유효 시간과 다시 쓸 때 남아 있어야 하는 시간. 기본은 2시간 주소를 1시간 다시 쓴다
 * @example const getSignedUrls = createSignedUrlCache()
 */
export const createSignedUrlCache = (now: () => number = Date.now, { expiresIn, minRemaining }: SignedUrlLifetime = DEFAULT_LIFETIME): GetSignedUrls => {
  const cachedUrls = new Map<string, CachedUrl>();

  const isUsable = ({ expiresAt }: CachedUrl): boolean => expiresAt - now() >= minRemaining * 1000;

  const readUsableUrl = (path: string): CachedUrl | undefined => {
    const cached = cachedUrls.get(path);
    return cached && isUsable(cached) ? cached : undefined;
  };

  const removeUnusableUrls = (): void => {
    for (const [path, cached] of cachedUrls) {
      if (!isUsable(cached)) cachedUrls.delete(path);
    }
  };

  return async (bucket, paths) => {
    // 서명을 기다리는 사이 재사용 시간이 끝나도 빈 주소가 되지 않게, 여기서 고른 주소를 끝까지 쓴다
    const urlByPath = new Map<string, CachedUrl>();
    const missingPaths: string[] = [];
    for (const path of new Set(paths)) {
      const usableUrl = readUsableUrl(path);
      if (usableUrl) urlByPath.set(path, usableUrl);
      else missingPaths.push(path);
    }

    if (missingPaths.length > 0) {
      // 응답을 기다린 시간만큼 만료가 앞당겨진 것으로 잡아, 남은 시간을 실제보다 길게 보지 않는다
      const expiresAt = now() + expiresIn * 1000;
      const { data, error } = await bucket.createSignedUrls(missingPaths, expiresIn);
      if (error) return { data: null, error };
      for (const { path, signedUrl } of data) {
        if (!path || !signedUrl) continue;
        // 동시 요청에서는 먼저 보관된 주소를 지켜, 같은 사진을 두 주소로 받지 않게 한다
        const storedUrl = readUsableUrl(path) ?? { signedUrl, expiresAt };
        cachedUrls.set(path, storedUrl);
        urlByPath.set(path, storedUrl);
      }
      removeUnusableUrls();
    }
    return {
      data: paths.map((path) => {
        const cached = urlByPath.get(path);
        return { path, signedUrl: cached?.signedUrl ?? null, expiresAt: cached?.expiresAt };
      }),
      error: null,
    };
  };
};

/**
 * 서버 메모리에 보관한 주소를 다시 쓰는 서명 함수. 서버 인스턴스마다 따로 보관하므로, 새 인스턴스에서는 새로 서명한다.
 *
 * @example const { data, error } = await getSignedUrls(supabase.storage.from(ALBUM_BUCKET), paths)
 */
export const getSignedUrls = createSignedUrlCache();

/**
 * 홈 사진(커플 사진·최근 데이트 썸네일)용 서명 함수. 7일 주소를 하루 동안 다시 쓰고, 휴대폰은 받은 주소를 기억해 며칠 더 쓴다(#219).
 * 같은 경로라도 기록 화면의 2시간 주소와 섞이지 않게 따로 보관한다.
 *
 * @example const { data, error } = await getHomePhotoSignedUrls(supabase.storage.from(ALBUM_BUCKET), [thumbPath])
 */
export const getHomePhotoSignedUrls = createSignedUrlCache(Date.now, { expiresIn: HOME_PHOTO_URL_EXPIRES_IN, minRemaining: HOME_PHOTO_URL_MIN_REMAINING });

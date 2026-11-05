import { SIGNED_URL_EXPIRES_IN, SIGNED_URL_MIN_REMAINING } from "./limits";

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

/** 요청한 경로 순서대로 서명 주소를 돌려준다. 다시 쓸 수 있는 주소는 서명하지 않는다 */
export type GetSignedUrls = (bucket: SigningBucket, paths: string[]) => Promise<SignedUrlsResult>;

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
 * @example const getSignedUrls = createSignedUrlCache()
 */
export const createSignedUrlCache = (now: () => number = Date.now): GetSignedUrls => {
  const cachedUrls = new Map<string, CachedUrl>();

  const isUsable = ({ expiresAt }: CachedUrl): boolean => expiresAt - now() >= SIGNED_URL_MIN_REMAINING * 1000;

  const readUsableUrl = (path: string): string | undefined => {
    const cached = cachedUrls.get(path);
    return cached && isUsable(cached) ? cached.signedUrl : undefined;
  };

  const removeUnusableUrls = (): void => {
    for (const [path, cached] of cachedUrls) {
      if (!isUsable(cached)) cachedUrls.delete(path);
    }
  };

  return async (bucket, paths) => {
    // 서명을 기다리는 사이 재사용 시간이 끝나도 빈 주소가 되지 않게, 여기서 고른 주소를 끝까지 쓴다
    const urlByPath = new Map<string, string>();
    const missingPaths: string[] = [];
    for (const path of new Set(paths)) {
      const usableUrl = readUsableUrl(path);
      if (usableUrl) urlByPath.set(path, usableUrl);
      else missingPaths.push(path);
    }

    if (missingPaths.length > 0) {
      // 응답을 기다린 시간만큼 만료가 앞당겨진 것으로 잡아, 남은 시간을 실제보다 길게 보지 않는다
      const expiresAt = now() + SIGNED_URL_EXPIRES_IN * 1000;
      const { data, error } = await bucket.createSignedUrls(missingPaths, SIGNED_URL_EXPIRES_IN);
      if (error) return { data: null, error };
      for (const { path, signedUrl } of data) {
        if (!path || !signedUrl) continue;
        // 동시 요청에서는 먼저 보관된 주소를 지켜, 같은 사진을 두 주소로 받지 않게 한다
        const storedUrl = readUsableUrl(path);
        if (!storedUrl) cachedUrls.set(path, { signedUrl, expiresAt });
        urlByPath.set(path, storedUrl ?? signedUrl);
      }
      removeUnusableUrls();
    }
    return { data: paths.map((path) => ({ path, signedUrl: urlByPath.get(path) ?? null })), error: null };
  };
};

/**
 * 서버 메모리에 보관한 주소를 다시 쓰는 서명 함수. 서버 인스턴스마다 따로 보관하므로, 새 인스턴스에서는 새로 서명한다.
 *
 * @example const { data, error } = await getSignedUrls(supabase.storage.from(ALBUM_BUCKET), paths)
 */
export const getSignedUrls = createSignedUrlCache();

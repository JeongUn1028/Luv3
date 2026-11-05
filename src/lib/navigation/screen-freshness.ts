/** 되돌아간 화면을 이 시간까지는 새로 불러오지 않는다. 목록과 상세를 잠깐 오갈 때 요청과 사진을 다시 받지 않게 한다 */
export const STALE_AFTER_MS = 30_000;

// 앱을 끄면 화면도 새로 받으므로 메모리에만 둔다
const loadedAtByScreen = new Map<string, number>();

const toScreenKey = (url: string, baseUrl: string): string => {
  const { pathname, search } = new URL(url, baseUrl);
  return `${pathname}${search}`;
};

/**
 * 이 주소의 화면을 방금 서버에서 받았다고 적는다. `url`은 상대 주소여도 된다.
 *
 * @example markScreenLoaded("/records", window.location.href);
 */
export const markScreenLoaded = (url: string, baseUrl: string, now: number = Date.now()): void => {
  loadedAtByScreen.set(toScreenKey(url, baseUrl), now);
};

/**
 * 지금까지 본 화면을 모두 방금 받은 것으로 친다. `router.refresh()`는 숨겨 둔 화면의 내용까지 지워, 돌아갈 때 Next가 새로 받기 때문이다.
 * 여기서 또 불러오면 같은 요청과 사진을 두 번 받는다.
 *
 * @example markAllScreensLoaded();
 */
export const markAllScreensLoaded = (now: number = Date.now()): void => {
  for (const key of loadedAtByScreen.keys()) loadedAtByScreen.set(key, now);
};

/**
 * 모든 화면을 오래된 것으로 친다. 저장은 끝났는데 바로 새로 불러올 수 없을 때(다른 폼을 쓰는 중) 쓴다.
 *
 * @example markAllScreensStale();
 */
export const markAllScreensStale = (): void => {
  loadedAtByScreen.clear();
};

/**
 * 되돌아간 이 화면을 새로 불러와야 하는지 알려 준다. 언제 받았는지 모르면 오래된 것으로 본다.
 *
 * @example if (isScreenStale(window.location.href, window.location.href)) router.refresh();
 */
export const isScreenStale = (url: string, baseUrl: string, now: number = Date.now()): boolean => {
  const loadedAt = loadedAtByScreen.get(toScreenKey(url, baseUrl));
  return loadedAt === undefined || now - loadedAt >= STALE_AFTER_MS;
};

/**
 * 받은 화면을 이 시간까지는 새로 불러오지 않는다. 목록과 상세, 탭 사이를 잠깐 오갈 때 요청과 사진을 다시 받지 않게 한다.
 * 되돌아간 화면은 HistoryReturn이, 링크로 옮긴 탭 화면은 Next가(화면 파일의 `unstable_dynamicStaleTime`, #405) 이 시간으로 판단한다
 */
export const STALE_AFTER_MS = 30_000;

/**
 * 링크로 다시 열 때 Next가 받은 지 30초가 안 됐으면 받아 둔 내용을 쓰는 화면: 하단 탭 네 개(#405).
 * 폼과 상세는 열 때마다 새로 받는다. 폼은 서버가 그릴 때마다 새 key로 비운 채 열리기 때문이다
 */
export const REUSED_SCREEN_PATHS: ReadonlySet<string> = new Set(["/", "/records", "/calendar", "/todos"]);

/** 링크로 옮긴 화면이 받아 둔 옛 내용을 보여 줄 때 window에 보내는 알림. HistoryReturn이 듣고 새로 받는다 */
export const STALE_ARRIVAL_EVENT = "luv3:stale-arrival";

/** 화면을 받은 때와, 그때가 몇 번째 "모두 오래된 것으로 치기" 뒤였는지 */
interface ScreenLoad {
  loadedAt: number;
  generation: number;
}

// 앱을 끄면 화면도 새로 받으므로 메모리에만 둔다
const loadsByScreen = new Map<string, ScreenLoad>();
// 모두 오래된 것으로 칠 때마다 올린다. 이보다 앞서 받은 화면은 받은 지 얼마 안 됐어도 오래된 것이다
let currentGeneration = 0;

const toScreenKey = (url: string, baseUrl: string): string => {
  const { pathname, search } = new URL(url, baseUrl);
  return `${pathname}${search}`;
};

const getCurrentLoad = (url: string, baseUrl: string): ScreenLoad | undefined => {
  const load = loadsByScreen.get(toScreenKey(url, baseUrl));
  return load?.generation === currentGeneration ? load : undefined;
};

/**
 * 이 주소의 화면을 방금 서버에서 받았다고 적는다. `url`은 상대 주소여도 된다.
 *
 * @example markScreenLoaded("/records", window.location.href);
 */
export const markScreenLoaded = (url: string, baseUrl: string, now: number = Date.now()): void => {
  loadsByScreen.set(toScreenKey(url, baseUrl), { loadedAt: now, generation: currentGeneration });
};

/**
 * 링크로 옮긴 화면을 적는다(`instrumentation-client`의 `onRouterTransitionStart`).
 * Next는 받은 지 30초가 안 된 탭 화면을 서버에 묻지 않고 받아 둔 내용으로 그리므로, 그때는 받은 때를 늘리지 않는다.
 * 받아 둔 내용이 모두 오래된 것으로 치기 전의 것이면 저장 전 내용이 보이므로, 도착한 뒤 새로 받아야 한다고 알려 준다.
 *
 * @returns 도착한 뒤 새로 받아야 하는지
 * @example if (markScreenOpened(url, window.location.href)) requestArrivalRefresh();
 */
export const markScreenOpened = (url: string, baseUrl: string, now: number = Date.now()): boolean => {
  const load = loadsByScreen.get(toScreenKey(url, baseUrl));
  const isReused = REUSED_SCREEN_PATHS.has(new URL(url, baseUrl).pathname) && load !== undefined && now - load.loadedAt < STALE_AFTER_MS;
  if (!isReused) {
    markScreenLoaded(url, baseUrl, now);
    return false;
  }
  return load.generation !== currentGeneration;
};

/**
 * 서버를 부르지 않고 주소만 바꾼 화면은 내용이 그대로이므로 처음 받은 때를 이어 받는다.
 *
 * @example copyScreenLoaded("/records", "/records?search=1", window.location.href);
 */
export const copyScreenLoaded = (fromUrl: string, toUrl: string, baseUrl: string): void => {
  const load = loadsByScreen.get(toScreenKey(fromUrl, baseUrl));
  if (load !== undefined) loadsByScreen.set(toScreenKey(toUrl, baseUrl), load);
};

/**
 * 지금까지 본 화면을 모두 방금 받은 것으로 친다. `router.refresh()`는 숨겨 둔 화면과 Next가 받아 둔 화면까지 지워, 다시 갈 때 Next가 새로 받기 때문이다.
 * 여기서 또 불러오면 같은 요청과 사진을 두 번 받는다.
 *
 * @example markAllScreensLoaded();
 */
export const markAllScreensLoaded = (now: number = Date.now()): void => {
  for (const key of loadsByScreen.keys()) loadsByScreen.set(key, { loadedAt: now, generation: currentGeneration });
};

/**
 * 모든 화면을 오래된 것으로 친다. 저장은 끝났는데 바로 새로 불러올 수 없을 때(다른 폼을 쓰는 중) 쓴다.
 * 받은 때는 남겨 둔다. Next가 받아 둔 화면을 다시 쓰는지 알아야 하기 때문이다(`markScreenOpened`).
 *
 * @example markAllScreensStale();
 */
export const markAllScreensStale = (): void => {
  currentGeneration += 1;
};

/**
 * 이 주소의 화면을 언제 받았는지 알려 준다. 모르거나 오래된 것으로 쳤으면 `undefined`.
 *
 * @example getScreenLoadedAt(window.location.href, window.location.href)
 */
export const getScreenLoadedAt = (url: string, baseUrl: string): number | undefined => getCurrentLoad(url, baseUrl)?.loadedAt;

/**
 * 되돌아간 이 화면을 새로 불러와야 하는지 알려 준다. 언제 받았는지 모르면 오래된 것으로 본다.
 *
 * @example if (isScreenStale(window.location.href, window.location.href)) router.refresh();
 */
export const isScreenStale = (url: string, baseUrl: string, now: number = Date.now()): boolean => {
  const loadedAt = getScreenLoadedAt(url, baseUrl);
  return loadedAt === undefined || now - loadedAt >= STALE_AFTER_MS;
};

import { toKstDate } from "@/lib/anniversary";

/** 홈 화면 앱으로 돌아왔을 때 이 시간이 지난 화면은 새로 받는다(#163). 사진 주소가 깨지기 전이고, 잠깐 다녀올 때는 다시 받지 않는다 */
export const APP_RETURN_STALE_AFTER_MS = 30 * 60 * 1000;

/**
 * 앱으로 돌아왔을 때 지금 화면을 새로 받아야 하는지 알려 준다.
 * 홈은 서버에서 그린 시각으로 "오늘"·D-day·지난 일정을 정하므로, 30분이 안 됐어도 한국 날짜가 바뀌었으면 새로 받는다.
 *
 * @param loadedAt 지금 화면을 받은 때. 모르면 새로 받는다
 * @example shouldRefreshOnReturn(getScreenLoadedAt(href, href), Date.now())
 */
export const shouldRefreshOnReturn = (loadedAt: number | undefined, now: number): boolean =>
  loadedAt === undefined || now - loadedAt >= APP_RETURN_STALE_AFTER_MS || toKstDate(new Date(loadedAt)) !== toKstDate(new Date(now));

/**
 * 앱 화면이 다시 보일 때마다 `onReturn`을 부른다. 듣기를 멈추는 함수를 돌려준다.
 * 저장된 페이지로 되살아날 때(pageshow)는 visibilitychange가 오지 않을 수 있어 함께 듣는다.
 *
 * @example useEffect(() => subscribeToAppReturn(handleReturn), []);
 */
export const subscribeToAppReturn = (onReturn: () => void): (() => void) => {
  const handleChange = () => {
    if (document.visibilityState === "visible") onReturn();
  };
  document.addEventListener("visibilitychange", handleChange);
  window.addEventListener("pageshow", handleChange);
  return () => {
    document.removeEventListener("visibilitychange", handleChange);
    window.removeEventListener("pageshow", handleChange);
  };
};

// TODO(#202): 휴대폰 측정이 끝나면 이 파일과 측정 기록·표시를 지운다

/** 앱을 켤 때 단계별 시간을 남기는 브라우저 저장소 키. 이 휴대폰에만 남고 서버로 보내지 않는다 */
export const STARTUP_TIMING_STORAGE_KEY = "luv3:startup-timings";

/** 기록을 새로 남겼을 때 같은 문서에 알리는 이벤트. 저장소의 `storage` 이벤트는 다른 창에만 가서 따로 둔다 */
export const STARTUP_TIMING_EVENT = "luv3:startup-timing";

/** 남겨 둘 최근 기록 수. 설정 화면에서 한눈에 볼 만큼만 둔다 */
export const STARTUP_TIMING_LIMIT = 10;

/** 문서 요청 시간 기록(`PerformanceNavigationTiming`) 중 쓰는 값. 모두 문서 요청을 시작한 때부터의 ms다 */
export interface NavigationTimingValues {
  redirectStart: number;
  redirectEnd: number;
  fetchStart: number;
  domainLookupStart: number;
  connectEnd: number;
  requestStart: number;
  responseStart: number;
  responseEnd: number;
}

/** CSS 파일 하나의 받은 기록(`PerformanceResourceTiming`) 중 쓰는 값 */
export interface StylesheetTimingValues {
  startTime: number;
  responseEnd: number;
  /** 0이면 휴대폰에 저장해 둔 파일을 썼다 */
  transferSize: number;
  /** 0이면 브라우저가 크기를 알려 주지 않아 새로 받았는지 알 수 없다 */
  decodedBodySize: number;
}

/** 앱을 켠 문서에서 읽은 브라우저 기록 */
export interface StartupTimingSource {
  navigation: NavigationTimingValues;
  /** 첫 그림(First Contentful Paint) 시각. 브라우저가 알려 주지 않으면 없다 */
  firstContentfulPaint: number | undefined;
  stylesheets: readonly StylesheetTimingValues[];
  measuredAt: string;
  path: string;
  isStandalone: boolean;
}

/**
 * 앱을 한 번 켤 때의 단계별 시간(ms). 문서 요청을 시작하기 전(아이폰이 웹 엔진을 띄우는 시간)은 브라우저가 알려 주지 않아 들어 있지 않다.
 * 그래서 검은 화면 전체 시간은 화면 녹화로 따로 재고, `firstPaintMs`와 비교해 그 앞 시간을 가늠한다.
 */
export interface StartupTiming {
  measuredAt: string;
  /** 처음 연 화면. 로그인이 풀려 있으면 로그인 화면이 된다 */
  path: string;
  /** 홈 화면 앱으로 열었는지. Safari에서 연 기록과 구별한다 */
  isStandalone: boolean;
  /** 문서 요청을 시작한 뒤 받기 시작할 때까지(저장해 둔 것 찾기 등) */
  beforeFetchMs: number;
  /** 로그인 화면 등으로 넘겨진 시간 */
  redirectMs: number;
  /** 주소 찾기 + 연결 + 암호화 연결 */
  connectMs: number;
  /** 요청을 보내고 첫 응답이 올 때까지. 서버가 쉬다 깨어나는 시간과 로그인 확인(`proxy`)이 여기에 든다 */
  serverMs: number;
  /** 첫 그림(검은 시작 이미지가 사라지는 때)까지 */
  firstPaintMs: number | undefined;
  /** 첫 그림 전에 요청한 CSS 중 마지막 것을 다 받은 때 */
  stylesheetEndMs: number | undefined;
  /** 휴대폰에 없어서 새로 받은 CSS 수. 브라우저가 크기를 알려 주지 않으면 없다 */
  stylesheetDownloadCount: number | undefined;
  /** 첫 그림 전에 요청한 CSS 수 */
  stylesheetCount: number;
}

/** `isAppLaunch`가 보는 문서 정보 */
export interface LaunchCheckParams {
  /** `PerformanceNavigationTiming.type` */
  type: string;
  referrer: string;
  origin: string;
}

/**
 * 앱을 켜서 연 문서인지. 시작 화면을 보여 주는 경우와 같게 본다(`SKIP_STARTUP_SPLASH_SCRIPT`에서 로그인 화면 조건만 뺀 기준):
 * 뒤로·앞으로 가기와 같은 사이트에서 옮겨 온 문서만 앱 안 이동이다. 아이폰이 쉬던 앱을 다시 띄우는 새로 고침도 켠 것으로 센다.
 *
 * @example isAppLaunch({ type: "navigate", referrer: "", origin: location.origin }) // true
 */
export const isAppLaunch = ({ type, referrer, origin }: LaunchCheckParams): boolean => {
  if (type === "back_forward") return false;
  if (type !== "navigate" || !referrer) return true;
  try {
    return new URL(referrer).origin !== origin;
  } catch {
    return true;
  }
};

const toDuration = (start: number, end: number): number => Math.max(0, Math.round(end - start));

/**
 * 브라우저 기록을 저장할 단계별 시간으로 바꾼다.
 *
 * @example toStartupTiming({ navigation, firstContentfulPaint: 1400, stylesheets, measuredAt, path: "/", isStandalone: true })
 */
export const toStartupTiming = ({ navigation, firstContentfulPaint, stylesheets, measuredAt, path, isStandalone }: StartupTimingSource): StartupTiming => {
  // 첫 그림을 막는 CSS는 그 전에 요청한다. 켠 뒤 다른 화면으로 옮겨 받은 CSS는 세지 않는다
  const startupStylesheets = firstContentfulPaint === undefined ? stylesheets : stylesheets.filter(({ startTime }) => startTime <= firstContentfulPaint);
  const isSizeKnown = startupStylesheets.every(({ decodedBodySize }) => decodedBodySize > 0);
  // 넘겨진 시간은 redirectMs에 따로 세므로, 넘겨진 뒤부터 잰다
  const fetchBase = navigation.redirectEnd > 0 ? navigation.redirectEnd : 0;

  return {
    measuredAt,
    path,
    isStandalone,
    beforeFetchMs: toDuration(fetchBase, navigation.fetchStart),
    redirectMs: toDuration(navigation.redirectStart, navigation.redirectEnd),
    connectMs: toDuration(navigation.domainLookupStart, navigation.connectEnd),
    serverMs: toDuration(navigation.requestStart, navigation.responseStart),
    firstPaintMs: firstContentfulPaint === undefined ? undefined : Math.round(firstContentfulPaint),
    stylesheetEndMs:
      startupStylesheets.length === 0 ? undefined : Math.round(Math.max(...startupStylesheets.map(({ responseEnd }) => responseEnd))),
    stylesheetDownloadCount: isSizeKnown ? startupStylesheets.filter(({ transferSize }) => transferSize > 0).length : undefined,
    stylesheetCount: startupStylesheets.length,
  };
};

/**
 * 새 기록을 맨 앞에 넣고 최근 `STARTUP_TIMING_LIMIT`개만 남긴다.
 *
 * @example appendStartupTiming(parseStartupTimings(saved), timing)
 */
export const appendStartupTiming = (timings: readonly StartupTiming[], timing: StartupTiming): StartupTiming[] =>
  [timing, ...timings].slice(0, STARTUP_TIMING_LIMIT);

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

const isOptionalNumber = (value: unknown): boolean => value === undefined || typeof value === "number";

const NUMBER_KEYS = ["beforeFetchMs", "redirectMs", "connectMs", "serverMs", "stylesheetCount"] as const;

const isDateString = (value: unknown): boolean => typeof value === "string" && !Number.isNaN(new Date(value).getTime());

const isStartupTiming = (value: unknown): value is StartupTiming =>
  isRecord(value) &&
  isDateString(value.measuredAt) &&
  typeof value.path === "string" &&
  typeof value.isStandalone === "boolean" &&
  NUMBER_KEYS.every((key) => typeof value[key] === "number") &&
  isOptionalNumber(value.firstPaintMs) &&
  isOptionalNumber(value.stylesheetEndMs) &&
  isOptionalNumber(value.stylesheetDownloadCount);

/**
 * 저장소에 남긴 기록을 읽는다. 없거나 읽을 수 없는 것은 빼서, 측정 표시가 화면을 깨뜨리지 않게 한다.
 *
 * @example parseStartupTimings(localStorage.getItem(STARTUP_TIMING_STORAGE_KEY))
 */
export const parseStartupTimings = (saved: string | null): StartupTiming[] => {
  if (!saved) return [];
  try {
    const parsed: unknown = JSON.parse(saved);
    return Array.isArray(parsed) ? parsed.filter(isStartupTiming) : [];
  } catch {
    return [];
  }
};

/**
 * ms를 초로 쓴다. 단계 차이가 0.1초 단위로 보이도록 둘째 자리까지 쓴다. 모르면 "?"
 *
 * @example formatSeconds(1400) // "1.40초"
 */
export const formatSeconds = (ms: number | undefined): string => (ms === undefined ? "?" : `${(ms / 1000).toFixed(2)}초`);

const MEASURED_AT_FORMAT = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

/**
 * 잰 시각을 한국 시간으로 쓴다. 앱을 오래 닫아 둔 뒤 켠 기록인지, 바로 다시 켠 기록인지 사용자가 가려 보는 데 쓴다.
 *
 * @example formatMeasuredAt("2026-11-09T01:03:00.000Z") // "11. 9. 10:03:00"
 */
export const formatMeasuredAt = (measuredAt: string): string => MEASURED_AT_FORMAT.format(new Date(measuredAt));

/**
 * CSS를 새로 받았는지 쓴다. 휴대폰에 저장해 둔 CSS가 지워져 다시 받는지 보려는 것이다.
 *
 * @example describeStylesheets({ stylesheetDownloadCount: 1, stylesheetCount: 2, stylesheetEndMs: 1300 }) // "CSS 2개 중 1개 새로 받음, 1.30초에 끝"
 */
export const describeStylesheets = ({
  stylesheetDownloadCount,
  stylesheetCount,
  stylesheetEndMs,
}: Pick<StartupTiming, "stylesheetDownloadCount" | "stylesheetCount" | "stylesheetEndMs">): string => {
  if (stylesheetCount === 0) return "CSS 기록 없음";
  const downloaded = stylesheetDownloadCount === undefined ? "새로 받았는지 모름" : `${String(stylesheetDownloadCount)}개 새로 받음`;
  return `CSS ${String(stylesheetCount)}개 중 ${downloaded}, ${formatSeconds(stylesheetEndMs)}에 끝`;
};

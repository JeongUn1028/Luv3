// TODO(#51): 홈 화면 앱 실기기에서 높이 수정을 확인한 뒤 지운다(화면 진단 표시와 함께)

/** 화면 진단 표시를 켰는지 남기는 브라우저 저장소 키. 홈 화면 앱은 Safari와 저장소가 따로라 앱 안에서 켠다 */
export const VIEWPORT_DEBUG_KEY = "luv3:debug-viewport";

/** 같은 탭 안에서 켜고 끈 것을 알리는 이벤트. storage 이벤트는 다른 탭에만 오기 때문에 따로 둔다 */
export const VIEWPORT_DEBUG_EVENT = "luv3:debug-viewport-change";

/** 접은 진단 표시에서도 보여 주는 차이 줄의 이름 */
export const GAP_LABELS = { dvh: "화면 − 100dvh", fixedInset: "화면 − fixed inset-0" } as const;

/** 한 시점에 잰 화면 높이 값(CSS px) */
export interface ViewportSnapshot {
  /** 페이지를 연 뒤 잰 시점(ms) */
  at: number;
  isStandalone: boolean;
  /** CSS `@media (display-mode: standalone)`가 맞는지. 화면 높이 변수(--app-height)가 이 조건으로 바뀐다 */
  isDisplayModeStandalone: boolean;
  /** iOS 전용 `navigator.standalone` */
  isNavigatorStandalone: boolean;
  /** 실제 화면의 세로 길이. iOS는 회전해도 screen.height를 바꾸지 않아 방향에 맞춰 고른다 */
  screenHeight: number;
  innerHeight: number;
  visualViewportHeight: number | undefined;
  clientHeight: number;
  vh: number;
  dvh: number;
  svh: number;
  lvh: number;
  /** `position: fixed; inset: 0` 요소의 높이(레이아웃 뷰포트) */
  fixedInsetHeight: number;
  safeAreaTop: number;
  safeAreaBottom: number;
  /** 화면 틀(`main`)의 아래 끝 */
  mainBottom: number | undefined;
  scrollY: number;
}

/** 진단 표 한 줄 */
export interface ViewportRow {
  label: string;
  first: string;
  current: string;
  isChanged: boolean;
}

type BooleanField = "isStandalone" | "isDisplayModeStandalone" | "isNavigatorStandalone";
type NumberField = Exclude<keyof ViewportSnapshot, BooleanField>;

const BOOLEAN_ROWS: readonly (readonly [string, BooleanField])[] = [
  ["홈 화면 앱", "isStandalone"],
  ["display-mode 미디어 쿼리", "isDisplayModeStandalone"],
  ["navigator.standalone", "isNavigatorStandalone"],
];

const NUMBER_ROWS: readonly (readonly [string, NumberField])[] = [
  ["screen.height", "screenHeight"],
  ["innerHeight", "innerHeight"],
  ["visualViewport.height", "visualViewportHeight"],
  ["html clientHeight", "clientHeight"],
  ["100vh", "vh"],
  ["100dvh", "dvh"],
  ["100svh", "svh"],
  ["100lvh", "lvh"],
  ["fixed inset-0", "fixedInsetHeight"],
  ["safe-area 위", "safeAreaTop"],
  ["safe-area 아래", "safeAreaBottom"],
  ["main 아래 끝", "mainBottom"],
  ["scrollY", "scrollY"],
  ["잰 시점(ms)", "at"],
];

const formatNumber = (value: number | undefined): string =>
  value === undefined ? "-" : String(Math.round(value * 10) / 10);

/** 화면 높이에서 각 높이 값을 뺀 차이. 0보다 크면 그만큼 아래가 비어 보일 수 있다 */
const getGap = (snapshot: ViewportSnapshot, field: "dvh" | "fixedInsetHeight"): number =>
  snapshot.screenHeight - snapshot[field];

/**
 * 처음 잰 값과 지금 값을 진단 표의 줄로 바꾼다. 시점 말고 값이 달라진 줄은 바뀐 것으로 표시한다.
 *
 * @example toViewportRows(firstSnapshot, currentSnapshot) // [{ label: "screen.height", first: "852", current: "852", isChanged: false }, ...]
 */
export const toViewportRows = (first: ViewportSnapshot, current: ViewportSnapshot): ViewportRow[] => {
  const toRow = (label: string, firstValue: string, currentValue: string, canChange = true): ViewportRow => ({
    label,
    first: firstValue,
    current: currentValue,
    isChanged: canChange && firstValue !== currentValue,
  });

  return [
    ...BOOLEAN_ROWS.map(([label, field]) => toRow(label, String(first[field]), String(current[field]))),
    ...NUMBER_ROWS.map(([label, field]) =>
      toRow(label, formatNumber(first[field]), formatNumber(current[field]), field !== "at"),
    ),
    toRow(GAP_LABELS.dvh, formatNumber(getGap(first, "dvh")), formatNumber(getGap(current, "dvh"))),
    toRow(
      GAP_LABELS.fixedInset,
      formatNumber(getGap(first, "fixedInsetHeight")),
      formatNumber(getGap(current, "fixedInsetHeight")),
    ),
  ];
};

/**
 * 화면 높이 값을 재는 함수(`window.__luv3MeasureViewport`)를 정의하고, 진단이 켜져 있으면 바로 한 번 잰다(`window.__luv3ViewportFirst`).
 * React가 하이드레이션하기 전, 문서를 읽는 중에 재야 앱을 띄운 순간의 값을 놓치지 않아서 `<body>` 맨 앞의 인라인 스크립트로 넣는다.
 * 잴 때만 보이지 않는 요소를 붙였다가 바로 떼어 내 화면과 하이드레이션에 영향을 주지 않는다.
 *
 * @example <script dangerouslySetInnerHTML={{ __html: VIEWPORT_MEASURE_SCRIPT }} />
 */
export const VIEWPORT_MEASURE_SCRIPT = `(function () {
  var measure = function () {
    var root = document.documentElement;
    var probe = function (style) {
      var element = document.createElement("div");
      element.style.cssText = "position:fixed;top:0;left:0;width:1px;visibility:hidden;pointer-events:none;" + style;
      root.appendChild(element);
      return element;
    };
    var heights = { vh: "height:100vh", dvh: "height:100dvh", svh: "height:100svh", lvh: "height:100lvh", fixedInsetHeight: "bottom:0" };
    var probes = {};
    for (var key in heights) probes[key] = probe(heights[key]);
    var safeArea = probe("padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)");
    var isPortrait = window.innerHeight >= window.innerWidth;
    var longSide = Math.max(screen.width, screen.height);
    var shortSide = Math.min(screen.width, screen.height);
    var main = document.querySelector("main");
    var snapshot = {
      at: Math.round(performance.now()),
      isStandalone: window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true,
      isDisplayModeStandalone: window.matchMedia("(display-mode: standalone)").matches,
      isNavigatorStandalone: navigator.standalone === true,
      screenHeight: isPortrait ? longSide : shortSide,
      innerHeight: window.innerHeight,
      visualViewportHeight: window.visualViewport ? window.visualViewport.height : undefined,
      clientHeight: root.clientHeight,
      mainBottom: main ? main.getBoundingClientRect().bottom : undefined,
      scrollY: window.scrollY
    };
    for (var name in probes) {
      snapshot[name] = probes[name].getBoundingClientRect().height;
      probes[name].remove();
    }
    var safeAreaStyle = getComputedStyle(safeArea);
    snapshot.safeAreaTop = parseFloat(safeAreaStyle.paddingTop);
    snapshot.safeAreaBottom = parseFloat(safeAreaStyle.paddingBottom);
    safeArea.remove();
    return snapshot;
  };
  window.__luv3MeasureViewport = measure;
  try {
    if (localStorage.getItem(${JSON.stringify(VIEWPORT_DEBUG_KEY)}) === "1") window.__luv3ViewportFirst = measure();
  } catch (error) {}
})();`;

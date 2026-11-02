/** 안내를 닫았는지 남기는 브라우저 저장소 키. 이 표시 여부 말고는 아무것도 저장하지 않는다 */
export const INSTALL_HINT_DISMISSED_KEY = "luv3:install-hint-dismissed";

/** 홈 화면 추가 안내를 띄울지 정하는 데 쓰는 브라우저 정보 */
export interface InstallEnvironment {
  userAgent: string;
  /** iPadOS Safari는 Mac처럼 자신을 알려서 터치 지점 수로 구분한다 */
  maxTouchPoints: number;
  /** 홈 화면 앱(standalone)으로 열었는지 */
  isStandalone: boolean;
  /** 사용자가 안내를 닫은 적이 있는지 */
  isDismissed: boolean;
}

// iOS의 다른 브라우저(Chrome·Firefox·Edge 등)는 이름표를 붙인다. 홈 화면 추가 위치가 달라 Safari만 안내한다
const OTHER_IOS_BROWSER_PATTERN = /CriOS|FxiOS|EdgiOS|OPiOS|GSA|KAKAOTALK|NAVER|Instagram|FBAN|Line\//;

/**
 * 아이폰·아이패드 Safari인지. iOS에는 설치 이벤트(`beforeinstallprompt`)가 없어 사용자 에이전트로 판단한다.
 *
 * @example isIosSafari(navigator.userAgent, navigator.maxTouchPoints)
 */
export const isIosSafari = (userAgent: string, maxTouchPoints: number): boolean => {
  const isIphone = /iPhone|iPod/.test(userAgent);
  const isIpad = /iPad/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1);
  return (isIphone || isIpad) && /Safari\//.test(userAgent) && !OTHER_IOS_BROWSER_PATTERN.test(userAgent);
};

/**
 * "홈 화면에 추가" 안내를 띄울지. iOS Safari에서 아직 홈 화면 앱이 아니고, 닫은 적이 없을 때만 띄운다.
 *
 * @example shouldShowInstallHint({ userAgent, maxTouchPoints: 5, isStandalone: false, isDismissed: false }) // true
 */
export const shouldShowInstallHint = ({
  userAgent,
  maxTouchPoints,
  isStandalone,
  isDismissed,
}: InstallEnvironment): boolean => !isStandalone && !isDismissed && isIosSafari(userAgent, maxTouchPoints);

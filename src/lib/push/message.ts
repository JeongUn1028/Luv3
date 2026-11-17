/**
 * 알림 하나의 내용. 서버가 JSON으로 보내고 서비스 워커(`public/sw.js`)가 읽어 보여 준다.
 * `url`은 알림을 누르면 열 앱 안 주소다(`/`로 시작하는 경로만, 다른 사이트 주소는 서비스 워커가 홈으로 바꾼다).
 */
export interface PushMessage {
  title: string;
  body: string;
  url: string;
  /** 앱 아이콘에 띄울 숫자(#364). 없으면 숫자를 바꾸지 않는다 */
  badge?: number;
}

/**
 * 앱을 보고 있는 동안 알림이 오면 서비스 워커가 앱 창에 보내는 메시지 종류(#364). 앱은 받으면 서버의 숫자를 지운다.
 * `public/sw.js`는 번들을 거치지 않아 같은 글자를 따로 적는다(service-worker.test.ts가 같은지 확인한다)
 */
export const PUSH_RECEIVED_MESSAGE = "luv3:push-received";

/**
 * 로그아웃 요청(폼)에 이 기기의 구독 주소를 담는 칸(#364). 로그아웃 경로가 세션이 있을 때 그 행을 지워,
 * 로그아웃한 기기로 상대 활동 알림이 가지 않게 한다
 */
export const SIGN_OUT_PUSH_ENDPOINT_FIELD = "push_endpoint";

/** 저장에 성공한 휴대폰이 상대에게 알림을 부탁하는 경로(#364, `POST`) */
export const PUSH_NOTIFY_PATH = "/api/push/notify";

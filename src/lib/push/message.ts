import { SETTINGS_PATH } from "@/lib/auth/paths";

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

/** 로그인한 사람의 기기들에 시험 알림을 보내는 경로(#363, `POST`) */
export const PUSH_TEST_PATH = "/api/push/test";

/**
 * 앱을 보고 있는 동안 알림이 오면 서비스 워커가 앱 창에 보내는 메시지 종류(#364). 앱은 받으면 서버의 숫자를 지운다.
 * `public/sw.js`는 번들을 거치지 않아 같은 글자를 따로 적는다(service-worker.test.ts가 같은지 확인한다)
 */
export const PUSH_RECEIVED_MESSAGE = "luv3:push-received";

/** 저장에 성공한 휴대폰이 상대에게 알림을 부탁하는 경로(#364, `POST`) */
export const PUSH_NOTIFY_PATH = "/api/push/notify";

/** 설정 화면의 "시험 알림 보내기"가 보내는 알림(#363). 누르면 설정 화면으로 돌아온다 */
export const PUSH_TEST_MESSAGE: Readonly<PushMessage> = Object.freeze({
  title: "Luv3 시험 알림",
  body: "이 기기에서 알림을 잘 받고 있어요.",
  url: SETTINGS_PATH,
});

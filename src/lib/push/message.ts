import { SETTINGS_PATH } from "@/lib/auth/paths";

/**
 * 알림 하나의 내용. 서버가 JSON으로 보내고 서비스 워커(`public/sw.js`)가 읽어 보여 준다.
 * `url`은 알림을 누르면 열 앱 안 주소다(`/`로 시작하는 경로만, 다른 사이트 주소는 서비스 워커가 홈으로 바꾼다).
 */
export interface PushMessage {
  title: string;
  body: string;
  url: string;
}

/** 로그인한 사람의 기기들에 시험 알림을 보내는 경로(#363, `POST`) */
export const PUSH_TEST_PATH = "/api/push/test";

/** 설정 화면의 "시험 알림 보내기"가 보내는 알림(#363). 누르면 설정 화면으로 돌아온다 */
export const PUSH_TEST_MESSAGE: Readonly<PushMessage> = Object.freeze({
  title: "Luv3 시험 알림",
  body: "이 기기에서 알림을 잘 받고 있어요.",
  url: SETTINGS_PATH,
});

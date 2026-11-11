/** 임시 서버 주소. 다른 프로젝트의 개발 서버와 겹치지 않는 포트를 쓴다 */
export const BASE_URL = "http://127.0.0.1:3100";

/** 상태바 아래에 비워 두는 높이(px). `globals.css`의 `--top-blank`와 같다 */
export const TOP_BLANK_SPACE = 44;

/** 로그인 상태를 저장하는 파일. 실행 때마다 새로 만들고 커밋하지 않는다 */
export const MEMBER_STATE_PATH = "e2e/.auth/member.json";

export const E2E_MEMBER = { email: "e2e-member@example.com", nickname: "E2E" } as const;

export const PHOTO_RECORD = { id: "e2e00000-0000-4000-8000-000000000001", title: "E2E 사진 기록" } as const;
export const PERIOD_RECORD = { id: "e2e00000-0000-4000-8000-000000000002", title: "E2E 달을 넘는 기록" } as const;

export const E2E_EVENTS = [
  { id: "e2e00000-0000-4000-8000-000000000011", title: "E2E 일정 하나" },
  { id: "e2e00000-0000-4000-8000-000000000012", title: "E2E 일정 둘" },
] as const;

export const E2E_TODOS = [
  { id: "e2e00000-0000-4000-8000-000000000021", content: "E2E 하고 싶은 것 하나" },
  { id: "e2e00000-0000-4000-8000-000000000022", content: "E2E 하고 싶은 것 둘" },
  { id: "e2e00000-0000-4000-8000-000000000023", content: "E2E 하고 싶은 것 셋" },
] as const;

export const COUPLE_PHOTO_PATH = "couple/e2e00000-0000-4000-8000-000000000031.jpg";

/** 사진 있는 기록에 넣는 사진 수. 고치기 화면이 스크롤되는 만큼 넣는다 */
export const PHOTO_COUNT = 3;

export const PHOTO_FIXTURE_PATH = "e2e/fixtures/photo.jpg";

/** 창(ModalDialog)이 열린 직후 누름을 받지 않는 시간(DOUBLE_TAP_GUARD_MS)보다 조금 길게. 연 다음 이만큼 기다린 뒤 창 안을 누른다 */
export const MODAL_OPEN_GUARD_WAIT_MS = 350;

import { randomUUID } from "node:crypto";

/** Playwright `TestInfo`에서 이름에 쓰는 부분 */
interface TestNameSource {
  project: { name: string };
}

/**
 * 테스트가 만드는 기록·일정·하고 싶은 것의 이름. 끝에 무작위 조각을 붙여, 다시 돌리거나(`retries`, `--repeat-each`)
 * 실행이 겹쳐도 남은 데이터와 이름이 부딪치지 않는다. 한 테스트 안에서는 한 번 만들어 같은 값을 쓴다.
 *
 * @example const title = createTestName("E2E 나가도 저장", testInfo) // "E2E 나가도 저장 iphone-15-pro 1a2b3c4d"
 */
export const createTestName = (label: string, testInfo: TestNameSource): string =>
  `${label} ${testInfo.project.name} ${randomUUID().slice(0, 8)}`;

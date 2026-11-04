import { randomUUID } from "node:crypto";
import { chromium } from "@playwright/test";
import { BASE_URL, E2E_MEMBER, MEMBER_STATE_PATH } from "./support/constants";
import { seedE2eData } from "./support/seed";

/** 테스트 계정과 데이터를 만들고 로그인 상태를 저장한다. 돌려준 함수는 테스트가 끝나면 Playwright가 부른다 */
const globalSetup = async (): Promise<() => Promise<void>> => {
  // 이번 실행에서만 쓰는 값이라 리포에 남기지 않고 실행 때마다 만든다
  const password = randomUUID();
  // 작업 프로세스는 환경 변수를 물려받는다. 다시 로그인하는 테스트에서 쓴다
  process.env.E2E_MEMBER_PASSWORD = password;
  const clear = await seedE2eData(password);

  const browser = await chromium.launch({ channel: "chrome" });
  try {
    const page = await browser.newPage();
    // 화면이 준비되기 전에 누르면 앱의 로그인 대신 브라우저 기본 제출이 일어난다
    await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle" });
    await page.getByLabel("이메일").fill(E2E_MEMBER.email);
    await page.getByLabel("비밀번호").fill(password);
    await page.getByRole("button", { name: "로그인" }).click();
    await page.waitForURL(`${BASE_URL}/`);
    await page.context().storageState({ path: MEMBER_STATE_PATH });
  } catch (error) {
    // 정리까지 실패해도 원인인 로그인 오류가 가려지지 않게 한다
    await clear().catch((clearError: unknown) => console.error(clearError));
    throw error;
  } finally {
    await browser.close();
  }

  return clear;
};

export default globalSetup;

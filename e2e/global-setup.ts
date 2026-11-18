import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { chromium } from "@playwright/test";
import { REMEMBERED_PHOTO_URLS_KEY } from "@/lib/photos/remembered-url";
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
    // 홈이 그리는 사진 주소를 휴대폰이 기억했는지는 저장하는 시각에 따라 달라, 실행마다 테스트의 처음 상태가 달라진다.
    // 기억한 주소가 있으면 그리드가 그 주소로 받아 서버 주소를 거절하는 테스트가 엇나가므로(app-return) 빼고 저장한다. 필요한 테스트는 직접 심는다
    const state = await page.context().storageState();
    const origins = state.origins.map((origin) => ({
      ...origin,
      localStorage: origin.localStorage.filter(({ name }) => name !== REMEMBERED_PHOTO_URLS_KEY),
    }));
    await writeFile(MEMBER_STATE_PATH, JSON.stringify({ ...state, origins }, undefined, 2));
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

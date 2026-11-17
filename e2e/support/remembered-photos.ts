import { readFileSync } from "node:fs";
import type { Page } from "@playwright/test";
import { REMEMBERED_PHOTO_URLS_KEY, type RememberedUrls } from "@/lib/photos/remembered-url";
import { PHOTO_FIXTURE_PATH } from "./constants";

/** 휴대폰이 기억한 것처럼 심어 두는 주소의 표시. 실제 서명 주소가 아니라 이 테스트가 응답을 정한다 */
const PLANTED_TOKEN = "e2e-remembered";

/**
 * 휴대폰이 경로로 기억한 사진 주소를 읽는다.
 *
 * @example const remembered = await readRememberedPhotoUrls(page)
 */
export const readRememberedPhotoUrls = (page: Page): Promise<RememberedUrls> =>
  page.evaluate((key) => JSON.parse(window.localStorage.getItem(key) ?? "{}") as RememberedUrls, REMEMBERED_PHOTO_URLS_KEY);

/**
 * 받은 사진 주소를 기억한 경로를 찾는다.
 *
 * @example const path = await findRememberedPath(page, serverUrl)
 */
export const findRememberedPath = async (page: Page, url: string): Promise<string | undefined> => {
  const remembered = await readRememberedPhotoUrls(page);
  return Object.keys(remembered).find((key) => remembered[key]?.url === url);
};

interface PlantRememberedUrlParams {
  path: string;
  /** 서버가 준 주소. 토큰만 바꿔 같은 파일의 다른 주소를 만든다 */
  serverUrl: string;
  expiresAt: number;
  /** true면 심은 주소는 만료된 서명처럼 400을 돌려준다 */
  isBroken?: boolean;
}

/**
 * 같은 경로에 다른 주소를 기억해 둔 것처럼 바꾸고, 그 주소의 응답을 정한다.
 *
 * @returns 심은 주소
 * @example const planted = await plantRememberedUrl(page, { path, serverUrl, expiresAt: Date.now() + DAY_MS })
 */
export const plantRememberedUrl = async (page: Page, { path, serverUrl, expiresAt, isBroken = false }: PlantRememberedUrlParams): Promise<string> => {
  const planted = new URL(serverUrl);
  planted.searchParams.set("token", PLANTED_TOKEN);
  await page.route(
    (url) => url.searchParams.get("token") === PLANTED_TOKEN,
    (route) =>
      isBroken
        ? route.fulfill({ status: 400, json: { statusCode: "400", error: "InvalidJWT", message: '"exp" claim timestamp check failed' } })
        : route.fulfill({ status: 200, contentType: "image/jpeg", body: readFileSync(PHOTO_FIXTURE_PATH) }),
  );
  await page.evaluate(
    ({ key, entry }) => {
      const remembered = JSON.parse(window.localStorage.getItem(key) ?? "{}") as Record<string, unknown>;
      window.localStorage.setItem(key, JSON.stringify({ ...remembered, [entry.path]: { url: entry.url, expiresAt: entry.expiresAt } }));
    },
    { key: REMEMBERED_PHOTO_URLS_KEY, entry: { path, url: planted.toString(), expiresAt } },
  );
  return planted.toString();
};

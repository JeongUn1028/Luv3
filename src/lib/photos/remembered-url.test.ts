import { describe, expect, it } from "vitest";
import { readSource } from "@/test-utils/source";
import { SIGNED_URL_MIN_REMAINING } from "./limits";
import { forgetPhotoUrl, parseRememberedUrls, pickPhotoUrl, rememberPhotoUrl, toRememberablePhoto, type RememberablePhoto } from "./remembered-url";

const NOW = new Date("2026-11-09T12:00:00+09:00").getTime();
const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_REMAINING_MS = SIGNED_URL_MIN_REMAINING * 1000;
const PHOTO: RememberablePhoto = { path: "couple/a_medium.jpg", url: "https://storage.test/a?token=new", expiresAt: NOW + 7 * DAY_MS };
const REMEMBERED_URL = "https://storage.test/a?token=old";

describe("pickPhotoUrl", () => {
  it("같은 경로의 기억한 주소가 아직 쓸 수 있으면, 서버가 다른 주소를 줘도 기억한 주소를 쓴다", () => {
    const remembered = { [PHOTO.path]: { url: REMEMBERED_URL, expiresAt: NOW + 3 * DAY_MS } };

    expect(pickPhotoUrl(PHOTO, remembered, NOW)).toBe(REMEMBERED_URL);
  });

  it("기억한 주소에 최소 유효 시간이 딱 남았으면 쓰고, 그보다 짧으면 서버 주소를 쓴다", () => {
    const at = (expiresAt: number) => pickPhotoUrl(PHOTO, { [PHOTO.path]: { url: REMEMBERED_URL, expiresAt } }, NOW);

    expect([at(NOW + MIN_REMAINING_MS), at(NOW + MIN_REMAINING_MS - 1)]).toEqual([REMEMBERED_URL, PHOTO.url]);
  });

  // 사진을 바꾸거나 지우면 경로가 달라져, 예전 사진의 주소를 쓰지 않는다
  it("다른 경로의 기억한 주소는 쓰지 않는다", () => {
    const remembered = { "couple/old_medium.jpg": { url: REMEMBERED_URL, expiresAt: NOW + 3 * DAY_MS } };

    expect(pickPhotoUrl(PHOTO, remembered, NOW)).toBe(PHOTO.url);
  });
});

describe("rememberPhotoUrl", () => {
  it("받은 사진의 주소와 만료 시각을 경로로 기억하고, 쓸 수 없게 된 주소는 지운다", () => {
    const remembered = {
      "couple/old.jpg": { url: "https://storage.test/old", expiresAt: NOW + MIN_REMAINING_MS - 1 },
      "r1/p_thumb.jpg": { url: "https://storage.test/thumb", expiresAt: NOW + DAY_MS },
    };

    expect(rememberPhotoUrl(remembered, PHOTO, NOW)).toEqual({
      "r1/p_thumb.jpg": { url: "https://storage.test/thumb", expiresAt: NOW + DAY_MS },
      [PHOTO.path]: { url: PHOTO.url, expiresAt: PHOTO.expiresAt },
    });
  });
});

describe("forgetPhotoUrl", () => {
  it("받지 못한 주소를 잊는다", () => {
    const remembered = { [PHOTO.path]: { url: REMEMBERED_URL, expiresAt: NOW + DAY_MS }, "b.jpg": { url: "https://storage.test/b", expiresAt: NOW + DAY_MS } };

    expect(forgetPhotoUrl(remembered, PHOTO.path)).toEqual({ "b.jpg": { url: "https://storage.test/b", expiresAt: NOW + DAY_MS } });
  });
});

describe("parseRememberedUrls", () => {
  it("저장해 둔 글자를 읽고, 모양이 다른 항목은 버린다", () => {
    const raw = JSON.stringify({ "a.jpg": { url: "https://storage.test/a", expiresAt: NOW }, "b.jpg": { url: 1, expiresAt: NOW }, "c.jpg": "x" });

    expect(parseRememberedUrls(raw)).toEqual({ "a.jpg": { url: "https://storage.test/a", expiresAt: NOW } });
  });

  it("없거나 깨진 글자면 기억이 없는 것으로 본다", () => {
    expect([parseRememberedUrls(null), parseRememberedUrls("{"), parseRememberedUrls("[]")]).toEqual([{}, {}, {}]);
  });
});

describe("toRememberablePhoto", () => {
  it("서명한 경로·주소·만료 시각을 묶고, 서명하지 못했으면 없다", () => {
    expect(toRememberablePhoto({ path: PHOTO.path, signedUrl: PHOTO.url, expiresAt: PHOTO.expiresAt })).toEqual(PHOTO);
    expect(toRememberablePhoto({ path: PHOTO.path, signedUrl: null, expiresAt: undefined })).toBeUndefined();
    expect(toRememberablePhoto(undefined)).toBeUndefined();
  });
});

describe("기억한 주소 지우기 연결", () => {
  // 7일 동안 쓸 수 있는 주소라, 로그아웃하거나 로그인이 풀려 로그인 화면에 오면 기기에 남기지 않는다
  it("로그인 화면에 오면 기억한 사진 주소를 모두 지운다", () => {
    expect(readSource("app/login/LoginForm.tsx")).toMatch(/useEffect\(\(\) => \{\s*forgetAllPhotoUrls\(\);\s*\}, \[\]\);/);
  });
});

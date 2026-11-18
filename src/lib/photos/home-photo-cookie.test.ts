import { describe, expect, it } from "vitest";
import {
  decodeHomePhotoCookie,
  forgetHomePhoto,
  HOME_PHOTO_COOKIE,
  parseHomePhotoCookie,
  pickHomePhotoSrc,
  rememberHomePhoto,
  toHomePhotoCookieString,
} from "./home-photo-cookie";
import { HOME_PHOTO_URL_EXPIRES_IN } from "./limits";

const NOW = Date.parse("2026-11-18T12:00:00+09:00");
const DAY_MS = 24 * 60 * 60 * 1000;

const COUPLE = { path: "couple/p1_medium.jpg", url: "https://storage.test/couple/p1_medium.jpg?token=new", expiresAt: NOW + 7 * DAY_MS };
const REMEMBERED = { ...COUPLE, url: "https://storage.test/couple/p1_medium.jpg?token=old", expiresAt: NOW + 3 * DAY_MS };

describe("parseHomePhotoCookie", () => {
  it("풀린 쿠키 값을 칸별 기억한 사진으로 읽고, 주소 안의 % 표기는 그대로 둔다", () => {
    // Arrange: Next의 cookies().get()은 값을 이미 풀어 준다
    const encodedPath = { ...REMEMBERED, url: "https://storage.test/couple/%EC%82%AC%EC%A7%84.jpg?token=old" };

    // Act
    const cookie = parseHomePhotoCookie(JSON.stringify({ couple: encodedPath }));

    // Assert
    expect(cookie).toEqual({ couple: encodedPath });
  });

  it.each([
    ["없음", undefined],
    ["JSON이 아님", "{broken"],
    ["배열", "[]"],
  ])("값이 %s이면 빈 기억으로 본다", (_, json) => {
    expect(parseHomePhotoCookie(json)).toEqual({});
  });

  it("모양이 다르거나 모르는 칸은 버린다", () => {
    const json = JSON.stringify({ couple: { path: "a", url: 1 }, latest: REMEMBERED, other: REMEMBERED });

    expect(parseHomePhotoCookie(json)).toEqual({ latest: REMEMBERED });
  });
});

describe("decodeHomePhotoCookie", () => {
  it("풀지 않은 값(document.cookie)을 한 번 풀어 읽는다", () => {
    expect(decodeHomePhotoCookie(encodeURIComponent(JSON.stringify({ couple: REMEMBERED })))).toEqual({ couple: REMEMBERED });
  });

  it.each([
    ["없음", undefined],
    ["잘못된 % 표기", "%E0%A4%A"],
  ])("값이 %s이면 빈 기억으로 본다", (_, raw) => {
    expect(decodeHomePhotoCookie(raw)).toEqual({});
  });
});

describe("pickHomePhotoSrc", () => {
  it("같은 경로를 기억했고 아직 쓸 수 있으면 기억한 주소를 쓴다", () => {
    expect(pickHomePhotoSrc(COUPLE, REMEMBERED, NOW)).toBe(REMEMBERED.url);
  });

  it("기억이 없거나, 사진을 바꿔 경로가 다르거나, 곧 만료되면 주지 않아 휴대폰 저장소의 기억을 쓰게 한다", () => {
    expect(pickHomePhotoSrc(COUPLE, undefined, NOW)).toBeUndefined();
    expect(pickHomePhotoSrc(COUPLE, { ...REMEMBERED, path: "couple/p0_medium.jpg" }, NOW)).toBeUndefined();
    expect(pickHomePhotoSrc(COUPLE, { ...REMEMBERED, expiresAt: NOW + 30 * 60 * 1000 }, NOW)).toBeUndefined();
  });
});

describe("rememberHomePhoto·forgetHomePhoto", () => {
  it("칸 하나만 바꾸고 다른 칸은 그대로 둔다", () => {
    // Arrange
    const latest = { path: "r1/p1_thumb.jpg", url: "https://storage.test/r1?token=a", expiresAt: NOW + DAY_MS };

    // Act
    const remembered = rememberHomePhoto({ latest }, "couple", COUPLE);
    const forgotten = forgetHomePhoto(remembered, "latest");

    // Assert
    expect(remembered).toEqual({ latest, couple: COUPLE });
    expect(forgotten).toEqual({ couple: COUPLE });
  });
});

describe("toHomePhotoCookieString", () => {
  it("기억을 인코딩해 홈 사진 주소가 쓸 수 있는 동안 남는 쿠키로 만든다", () => {
    // Act
    const cookie = toHomePhotoCookieString({ couple: COUPLE }, { isSecure: true });

    // Assert
    expect(cookie).toBe(
      `${HOME_PHOTO_COOKIE}=${encodeURIComponent(JSON.stringify({ couple: COUPLE }))}; Path=/; Max-Age=${HOME_PHOTO_URL_EXPIRES_IN}; SameSite=Lax; Secure`,
    );
    expect(decodeHomePhotoCookie(cookie.split(";")[0]?.split("=")[1])).toEqual({ couple: COUPLE });
  });

  it("기억이 비면 쿠키를 지우고, http 주소에서는 Secure를 붙이지 않는다", () => {
    expect(toHomePhotoCookieString({}, { isSecure: false })).toBe(`${HOME_PHOTO_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`);
  });
});

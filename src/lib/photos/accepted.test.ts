import { describe, expect, it } from "vitest";
import { isAcceptedPhoto, isHeic, PHOTO_INPUT_ACCEPT } from "./accepted";

describe("isAcceptedPhoto", () => {
  it("JPEG·PNG·WebP·HEIC는 받는다", () => {
    expect(isAcceptedPhoto(new File([], "a.jpg", { type: "image/jpeg" }))).toBe(true);
    expect(isAcceptedPhoto(new File([], "a.png", { type: "image/png" }))).toBe(true);
    expect(isAcceptedPhoto(new File([], "a.webp", { type: "image/webp" }))).toBe(true);
    expect(isAcceptedPhoto(new File([], "IMG_0001.HEIC"))).toBe(true);
  });

  it("GIF·SVG와 사진이 아닌 파일은 받지 않는다", () => {
    expect(isAcceptedPhoto(new File([], "a.gif", { type: "image/gif" }))).toBe(false);
    expect(isAcceptedPhoto(new File([], "a.svg", { type: "image/svg+xml" }))).toBe(false);
    expect(isAcceptedPhoto(new File([], "memo.txt", { type: "text/plain" }))).toBe(false);
  });
});

describe("PHOTO_INPUT_ACCEPT", () => {
  // 아이폰은 HEIC를 받는다고 알리지 않는 칸에 사진을 JPEG로 바꿔 넘기며 위치 정보(GPS)를 지운다(#249, 2026-11-10 실기기 확인).
  // 빼면 사진 위치 자동 채우기가 조용히 멈추므로 고정한다
  it("HEIC를 MIME 타입과 확장자로 받는다고 알린다", () => {
    // Arrange
    const accepted = PHOTO_INPUT_ACCEPT.split(",");

    // Assert
    expect(accepted).toEqual(expect.arrayContaining(["image/heic", "image/heif", ".heic", ".heif"]));
  });
});

describe("isHeic", () => {
  it("MIME 타입이 HEIC·HEIF면 true다", () => {
    expect(isHeic(new File([], "a.heic", { type: "image/heic" }))).toBe(true);
    expect(isHeic(new File([], "a", { type: "image/heif" }))).toBe(true);
  });

  // 안드로이드 Chrome은 HEIC 파일의 MIME 타입을 비워 두는 경우가 있다
  it("MIME 타입이 비어 있으면 확장자로 판단한다", () => {
    expect(isHeic(new File([], "IMG_0001.HEIC"))).toBe(true);
    expect(isHeic(new File([], "IMG_0001.jpg"))).toBe(false);
  });

  // 일부 파일 선택기는 HEIC를 일반 바이너리(application/octet-stream)로 넘긴다
  it("MIME 타입이 octet-stream이어도 확장자로 판단한다", () => {
    expect(isHeic(new File([], "a.heic", { type: "application/octet-stream" }))).toBe(true);
  });

  it("JPEG는 false다", () => {
    expect(isHeic(new File([], "a.jpg", { type: "image/jpeg" }))).toBe(false);
  });
});

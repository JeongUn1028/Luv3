import { describe, expect, it } from "vitest";
import { shouldHidePreview, toCouplePhotoView } from "./preview";

const PHOTO_ID = "6b1f0c2e-9a4d-4c1b-8f3e-2d5a7b9c1e0f";
const OLD_PATH = "couple/0d9c8b7a-6f5e-4d3c-2b1a-0f9e8d7c6b5a_medium.jpg";

describe("toCouplePhotoView", () => {
  it("고른 사진을 그릴 수 있으면 서버 사진보다 먼저 보여 준다", () => {
    // Act
    const view = toCouplePhotoView({ photoPath: OLD_PATH, preview: { photoId: PHOTO_ID, url: "blob:picked", replacedPath: OLD_PATH }, clearingPath: undefined });

    // Assert
    expect(view).toEqual({ kind: "preview", url: "blob:picked" });
  });

  it("커플 사진이 없어도 고른 사진을 보여 준다", () => {
    expect(toCouplePhotoView({ photoPath: undefined, preview: { photoId: PHOTO_ID, url: "blob:picked", replacedPath: OLD_PATH }, clearingPath: undefined })).toEqual({
      kind: "preview",
      url: "blob:picked",
    });
  });

  // 브라우저가 고른 파일(HEIC 등)을 그리지 못하면 줄인 사진이 올 때까지 원래 사진이나 추가 칸을 둔다
  it("고른 사진을 아직 그릴 수 없으면 원래 사진을, 없으면 추가 칸을 보여 준다", () => {
    const waiting = { photoId: PHOTO_ID, url: undefined, replacedPath: OLD_PATH };

    expect(toCouplePhotoView({ photoPath: OLD_PATH, preview: waiting, clearingPath: undefined })).toEqual({ kind: "photo" });
    expect(toCouplePhotoView({ photoPath: undefined, preview: waiting, clearingPath: undefined })).toEqual({ kind: "empty" });
  });

  it("지우기를 누른 사진은 서버가 아직 주더라도 추가 칸으로 보여 준다", () => {
    expect(toCouplePhotoView({ photoPath: OLD_PATH, preview: undefined, clearingPath: OLD_PATH })).toEqual({ kind: "empty" });
  });

  // 지우는 사이 상대가 새 사진으로 바꿨으면 그 사진은 지운 게 아니다
  it("지우기를 누른 사진과 다른 사진이 오면 그 사진을 보여 준다", () => {
    expect(toCouplePhotoView({ photoPath: "couple/other_medium.jpg", preview: undefined, clearingPath: OLD_PATH })).toEqual({ kind: "photo" });
  });

  it("고른 사진도 지우는 사진도 없으면 서버 사진을, 서버 사진도 없으면 추가 칸을 보여 준다", () => {
    expect(toCouplePhotoView({ photoPath: OLD_PATH, preview: undefined, clearingPath: undefined })).toEqual({ kind: "photo" });
    expect(toCouplePhotoView({ photoPath: undefined, preview: undefined, clearingPath: undefined })).toEqual({ kind: "empty" });
  });
});

describe("shouldHidePreview", () => {
  const preview = { photoId: PHOTO_ID, url: "blob:picked", replacedPath: OLD_PATH };

  it("고를 때 보이던 사진과 다른 서버 사진을 받으면 미리 보기를 치운다", () => {
    expect(shouldHidePreview(preview, `couple/${PHOTO_ID}_medium.jpg`)).toBe(true);
  });

  // 저장하는 사이 상대가 다른 사진으로 바꿨어도 그 사진이 지금 커플 사진이다
  it("상대가 바꾼 사진을 받아도 미리 보기를 치운다", () => {
    expect(shouldHidePreview(preview, "couple/other_medium.jpg")).toBe(true);
  });

  it("고를 때 보이던 사진을 다시 받으면 저장이 끝나지 않은 것이라 남겨 둔다", () => {
    expect(shouldHidePreview(preview, OLD_PATH)).toBe(false);
  });

  it("처음 추가할 때는 서버 사진이 생기면 치운다", () => {
    const firstPreview = { ...preview, replacedPath: undefined };

    expect(shouldHidePreview(firstPreview, `couple/${PHOTO_ID}_medium.jpg`)).toBe(true);
    expect(shouldHidePreview(firstPreview, undefined)).toBe(false);
  });

  it("미리 보여 주는 사진이 없으면 치울 것도 없다", () => {
    expect(shouldHidePreview(undefined, `couple/${PHOTO_ID}_medium.jpg`)).toBe(false);
  });
});

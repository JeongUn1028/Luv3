import { describe, expect, it } from "vitest";
import { buildCouplePhotoPath, buildPhotoPaths, toCouplePhotoMediumPath } from "./paths";

const DATE_ID = "10000000-0000-4000-8000-000000000001";
const PHOTO_ID = "20000000-0000-4000-8000-000000000002";

describe("buildPhotoPaths", () => {
  it("기록 id와 사진 id로 원본·썸네일 경로를 만든다", () => {
    expect(buildPhotoPaths(DATE_ID, PHOTO_ID)).toEqual({
      path: `${DATE_ID}/${PHOTO_ID}.jpg`,
      thumbPath: `${DATE_ID}/${PHOTO_ID}_thumb.jpg`,
    });
  });

  // id가 경로에 그대로 들어가므로, UUID가 아니면 다른 폴더(../)에 파일이 생길 수 있다
  it("id가 UUID 형식이 아니면 에러를 낸다", () => {
    expect(() => buildPhotoPaths("../etc", PHOTO_ID)).toThrow("UUID");
    expect(() => buildPhotoPaths(DATE_ID, "photo-1")).toThrow("UUID");
  });
});

describe("buildCouplePhotoPath", () => {
  it("커플 사진은 기록 폴더와 겹치지 않는 couple 폴더에 사진 id로 둔다", () => {
    expect(buildCouplePhotoPath(PHOTO_ID)).toBe(`couple/${PHOTO_ID}.jpg`);
  });

  // DB의 경로 검사는 소문자만 받는다
  it("대문자 UUID도 소문자 경로로 만든다", () => {
    const photoId = "abcdef00-0000-4000-8000-00000000000a";

    expect(buildCouplePhotoPath(photoId.toUpperCase())).toBe(`couple/${photoId}.jpg`);
  });

  it("사진 id가 UUID 형식이 아니면 에러를 낸다", () => {
    expect(() => buildCouplePhotoPath("../x")).toThrow("UUID");
  });
});

describe("toCouplePhotoMediumPath", () => {
  // DB에는 원본 경로만 있어, 홈 카드용 중간 크기는 이름 규칙으로 원본 옆에 둔다(#218)
  it("원본 경로 옆에 _medium을 붙인 경로를 만든다", () => {
    expect(toCouplePhotoMediumPath(`couple/${PHOTO_ID}.jpg`)).toBe(`couple/${PHOTO_ID}_medium.jpg`);
  });

  it(".jpg로 끝나지 않는 경로는 원본과 같은 경로가 되므로 받지 않는다", () => {
    expect(() => toCouplePhotoMediumPath(`couple/${PHOTO_ID}.JPG`)).toThrow();
  });
});

import { describe, expect, it } from "vitest";
import { buildPhotoPaths } from "./paths";

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

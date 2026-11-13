import { describe, expect, it } from "vitest";
import { MAX_GROUP_PHOTOS } from "./photo-group-draft";
import { toPickNotice } from "./photo-pick-notice";

describe("toPickNotice", () => {
  it("뺀 사진이 없으면 알리지 않는다", () => {
    expect(toPickNotice({ skippedCount: 0, droppedCount: 0, isNewGroup: true })).toBeUndefined();
  });

  it("받을 수 없는 파일 수를 알린다", () => {
    expect(toPickNotice({ skippedCount: 2, droppedCount: 0, isNewGroup: false })).toBe("JPEG·PNG·WebP·HEIC 사진만 올릴 수 있어 2개는 뺐어요.");
  });

  it("새 모음에서 넘쳐 뺀 사진은 새 모음으로 고르라고 덧붙인다", () => {
    expect([
      toPickNotice({ skippedCount: 0, droppedCount: 3, isNewGroup: true }),
      toPickNotice({ skippedCount: 0, droppedCount: 3, isNewGroup: false }),
    ]).toEqual([
      `모음 하나에 사진은 ${MAX_GROUP_PHOTOS}장까지라 3장은 뺐어요. 남은 사진은 새 모음으로 골라 주세요.`,
      `모음 하나에 사진은 ${MAX_GROUP_PHOTOS}장까지라 3장은 뺐어요.`,
    ]);
  });

  it("두 가지를 모두 뺐으면 한 문장씩 이어 알린다", () => {
    expect(toPickNotice({ skippedCount: 1, droppedCount: 2, isNewGroup: false })).toBe(
      `JPEG·PNG·WebP·HEIC 사진만 올릴 수 있어 1개는 뺐어요. 모음 하나에 사진은 ${MAX_GROUP_PHOTOS}장까지라 2장은 뺐어요.`,
    );
  });
});

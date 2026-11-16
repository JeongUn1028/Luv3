import { describe, expect, it } from "vitest";
import { isRecordId, toRecordHref, toRecordPhotoHref } from "./record-href";

describe("isRecordId", () => {
  it("UUID 형식만 기록 id로 받는다", () => {
    expect(isRecordId("5a87e560-6a6e-49be-8af3-db196468143c")).toBe(true);
    expect(isRecordId("5A87E560-6A6E-49BE-8AF3-DB196468143C")).toBe(true);
    expect(isRecordId("not-a-uuid")).toBe(false);
    expect(isRecordId("5a87e560-6a6e-49be-8af3-db196468143c/../x")).toBe(false);
  });
});

describe("toRecordHref", () => {
  it("기록 id로 상세 주소를 만든다", () => {
    expect(toRecordHref("r1")).toBe("/dates/r1");
  });
});

describe("toRecordPhotoHref", () => {
  it("기록 상세 주소에 처음 펼칠 사진을 붙인다", () => {
    expect(toRecordPhotoHref({ recordId: "r1", photoId: "p2" })).toBe("/dates/r1?photo=p2");
  });
});

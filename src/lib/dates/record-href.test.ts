import { describe, expect, it } from "vitest";
import { toRecordEditHref, toRecordHref, toRecordPhotoHref } from "./record-href";

describe("toRecordHref", () => {
  it("기록 id로 상세 주소를 만든다", () => {
    expect(toRecordHref("r1")).toBe("/dates/r1");
  });
});

describe("toRecordEditHref", () => {
  it("기록 id로 고치기 주소를 만든다", () => {
    expect(toRecordEditHref("r1")).toBe("/dates/r1/edit");
  });
});

describe("toRecordPhotoHref", () => {
  it("기록 상세 주소에 처음 펼칠 사진을 붙인다", () => {
    expect(toRecordPhotoHref({ recordId: "r1", photoId: "p2" })).toBe("/dates/r1?photo=p2");
  });
});

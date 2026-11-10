import { describe, expect, it } from "vitest";
import { EventLinkError, toEventLinkMessage, toLinkableRecords, toLinkFailureMessage } from "./event-link";

describe("toLinkableRecords", () => {
  const row = { id: "r1", date: "2026-11-01", end_date: null, title: "산책", cover: { thumb_path: "r1/p1_thumb.jpg" } };

  it("후보 기록에 대표 사진 썸네일 주소를 붙이고 DB의 null은 undefined로 바꾼다", () => {
    expect(toLinkableRecords([row], [{ path: "r1/p1_thumb.jpg", signedUrl: "https://example.test/p1" }])).toEqual([
      { id: "r1", date: "2026-11-01", endDate: undefined, title: "산책", thumbUrl: "https://example.test/p1" },
    ]);
  });

  it("대표 사진이 없거나 주소를 받지 못했으면 사진 없이 고르게 한다", () => {
    const records = toLinkableRecords([{ ...row, id: "r2", end_date: "2026-11-02", cover: null }, row], []);
    expect(records.map(({ endDate, thumbUrl }) => [endDate, thumbUrl])).toEqual([
      ["2026-11-02", undefined],
      [undefined, undefined],
    ]);
  });
});

describe("toLinkFailureMessage", () => {
  it.each([
    ["P0410", "이 일정의 그날에는 이미 이어진 기록이 있어요."],
    ["P0411", "이미 다른 일정과 이어진 기록이에요."],
    ["P0002", "기록이나 일정이 지워졌어요. 화면을 새로 고쳐 주세요."],
    ["22023", "이 일정과 이을 수 없는 기록이에요."],
  ])("거절 코드 %s는 까닭을 알려 준다", (code, message) => {
    expect(toLinkFailureMessage(code)).toBe(message);
  });

  it("까닭을 모르면 다시 해 보라고 한다", () => {
    expect(toLinkFailureMessage(undefined)).toBe("잇지 못했어요. 잠시 후 다시 시도해 주세요.");
    expect(toLinkFailureMessage("08006")).toBe("잇지 못했어요. 잠시 후 다시 시도해 주세요.");
  });
});

describe("toEventLinkMessage", () => {
  it("잇기·끊기 오류는 그 문구를, 예상 못한 오류는 다시 해 보라는 문구를 돌려준다", () => {
    expect(toEventLinkMessage(new EventLinkError("이미 다른 일정과 이어진 기록이에요."))).toBe("이미 다른 일정과 이어진 기록이에요.");
    expect(toEventLinkMessage(new TypeError("Failed to fetch"))).toBe("잇지 못했어요. 잠시 후 다시 시도해 주세요.");
  });
});

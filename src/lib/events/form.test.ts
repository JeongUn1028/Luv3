import { describe, expect, it } from "vitest";
import {
  createEmptyEventDraft,
  toEditableEvent,
  toEventDraft,
  toEventValues,
  validateEventDraft,
  type EventDraft,
} from "./form";

const draft = (overrides: Partial<EventDraft> = {}): EventDraft => ({
  ...createEmptyEventDraft("2026-11-14"),
  title: "전시 보기",
  ...overrides,
});

describe("validateEventDraft", () => {
  it("필수 값이 맞으면 에러가 없다(지난 날·앞으로의 날 모두 된다)", () => {
    expect(validateEventDraft(draft())).toEqual({});
    expect(validateEventDraft(draft({ date: "2020-01-01" }))).toEqual({});
  });

  it("제목이 비었거나 글자 수를 넘으면 알려 준다", () => {
    expect(validateEventDraft(draft({ title: "  " })).title).toBe("제목을 적어 주세요.");
    const errors = validateEventDraft(
      draft({ title: "가".repeat(101), place: "가".repeat(101), memo: "가".repeat(2001) }),
    );
    expect(errors).toEqual({
      title: "제목은 100자까지 적을 수 있어요.",
      place: "장소는 100자까지 적을 수 있어요.",
      memo: "메모는 2,000자까지 적을 수 있어요.",
    });
  });

  it("종일이 아니면 시간을 골라야 한다", () => {
    expect(validateEventDraft(draft({ isAllDay: false, startTime: "" })).startTime).toBe("시간을 골라 주세요.");
    expect(validateEventDraft(draft({ isAllDay: false, startTime: "19:30" }))).toEqual({});
  });

  it("날짜가 없으면 알려 준다", () => {
    expect(validateEventDraft(draft({ date: "" })).date).toBe("날짜를 골라 주세요.");
    expect(validateEventDraft(draft({ date: "2026-02-31" })).date).toBe("날짜를 골라 주세요.");
  });
});

describe("toEventValues", () => {
  it("저장할 값으로 바꾼다: 앞뒤 공백을 지우고, 빈 장소·메모와 종일의 시간은 null", () => {
    expect(toEventValues(draft({ title: " 전시 ", place: " ", memo: " 표 예매함 " }))).toEqual({
      date: "2026-11-14",
      start_time: null,
      title: "전시",
      place: null,
      memo: "표 예매함",
      is_together: true,
    });
    expect(toEventValues(draft({ isAllDay: false, startTime: "19:30" })).start_time).toBe("19:30");
  });

  it("한 사람 일정을 고르면 함께 일정이 아니라고 저장한다", () => {
    expect(toEventValues(draft({ isTogether: false })).is_together).toBe(false);
  });
});

describe("createEmptyEventDraft", () => {
  it("새 일정은 함께 일정으로 시작한다", () => {
    expect(createEmptyEventDraft("2026-11-14").isTogether).toBe(true);
  });
});

describe("toEventDraft", () => {
  it("저장된 일정을 수정 화면 값으로 바꾼다", () => {
    expect(
      toEventDraft({ date: "2026-11-14", start_time: "19:30:00", title: "저녁", place: null, memo: null, is_together: true }),
    ).toEqual({ date: "2026-11-14", isAllDay: false, startTime: "19:30", title: "저녁", place: "", memo: "", isTogether: true });
    expect(
      toEventDraft({ date: "2026-11-14", start_time: null, title: "전시", place: "미술관", memo: "메모", is_together: false }),
    ).toEqual({ date: "2026-11-14", isAllDay: true, startTime: "", title: "전시", place: "미술관", memo: "메모", isTogether: false });
  });
});

describe("toEditableEvent", () => {
  it("일정 행에서 작성자를 닉네임으로 바꾸고 나머지 값은 그대로 둔다", () => {
    const row = { id: "e1", date: "2026-11-14", start_time: null, title: "저녁", place: null, memo: null, is_together: true };
    expect(toEditableEvent({ ...row, author: { nickname: "정운" } })).toEqual({ ...row, authorNickname: "정운" });
  });

  it("작성자를 읽지 못하면 undefined로 둔다", () => {
    const row = {
      id: "e1",
      date: "2026-11-14",
      start_time: null,
      title: "저녁",
      place: null,
      memo: null,
      is_together: true,
      author: null,
    };
    expect(toEditableEvent(row).authorNickname).toBeUndefined();
  });
});

import { describe, expect, it } from "vitest";
import {
  getMinDateAfterStart,
  changeDraftScope,
  findViewedPeriodDate,
  getDateAfterSave,
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

describe("getMinDateAfterStart", () => {
  it("시작하는 날의 다음 날이다", () => {
    expect(getMinDateAfterStart("2026-11-30")).toBe("2026-12-01");
  });

  it("시작하는 날이 비었거나 틀리면 제한을 두지 않는다", () => {
    expect(getMinDateAfterStart("")).toBeUndefined();
    expect(getMinDateAfterStart("2026-02-31")).toBeUndefined();
  });
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

  it("끝나는 날은 비워 둘 수 있고, 적으면 시작하는 날 뒤여야 한다", () => {
    const message = "끝나는 날은 시작하는 날 뒤로 골라 주세요.";
    expect(validateEventDraft(draft({ repeatRule: "weekly" }))).toEqual({});
    expect(validateEventDraft(draft({ repeatRule: "weekly", repeatUntil: "2026-11-15" }))).toEqual({});
    expect(validateEventDraft(draft({ repeatRule: "weekly", repeatUntil: "2026-11-14" })).repeatUntil).toBe(message);
    expect(validateEventDraft(draft({ repeatRule: "weekly", repeatUntil: "2026-11-13" })).repeatUntil).toBe(message);
  });

  it("끝나는 날이 틀린 날짜면 다시 고르게 한다", () => {
    expect(validateEventDraft(draft({ repeatRule: "weekly", repeatUntil: "2026-02-31" })).repeatUntil).toBe("끝나는 날을 다시 골라 주세요.");
  });

  it("이 날만 고치거나 반복하지 않으면 끝나는 날을 보지 않는다", () => {
    expect(validateEventDraft(draft({ scope: "occurrence", repeatRule: "weekly", repeatUntil: "2026-11-01" }))).toEqual({});
    expect(validateEventDraft(draft({ repeatUntil: "2026-11-01" }))).toEqual({});
  });

  it("끝 날짜는 시작 날짜보다 뒤여야 한다", () => {
    const message = "끝 날짜는 시작 날짜보다 뒤여야 해요.";
    expect(validateEventDraft(draft({ endDate: "2026-11-15" }))).toEqual({});
    expect(validateEventDraft(draft({ endDate: "2026-11-14" })).endDate).toBe(message);
    expect(validateEventDraft(draft({ endDate: "2026-11-13" })).endDate).toBe(message);
  });

  it("이 날만 고칠 때는 끝 날짜 칸이 없으므로 끝 날짜를 보지 않는다", () => {
    expect(validateEventDraft(draft({ scope: "occurrence", endDate: "" }))).toEqual({});
  });

  it("기간을 켜고 끝 날짜를 고르지 않으면 알려 준다", () => {
    expect(validateEventDraft(draft({ endDate: "" })).endDate).toBe("끝 날짜를 골라 주세요.");
    expect(validateEventDraft(draft({ endDate: "2026-02-31" })).endDate).toBe("끝 날짜를 골라 주세요.");
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
      repeat_rule: null,
      repeat_until: null,
      end_date: null,
    });
    expect(toEventValues(draft({ isAllDay: false, startTime: "19:30" })).start_time).toBe("19:30");
  });

  it("한 사람 일정을 고르면 함께 일정이 아니라고 저장한다", () => {
    expect(toEventValues(draft({ isTogether: false })).is_together).toBe(false);
  });

  it("반복 규칙과 끝나는 날을 저장하고, 끝나는 날이 비면 null로 둔다", () => {
    const repeating = toEventValues(draft({ repeatRule: "monthly", repeatUntil: "2027-01-01" }));
    expect([repeating.repeat_rule, repeating.repeat_until]).toEqual(["monthly", "2027-01-01"]);
    expect(toEventValues(draft({ repeatRule: "weekly" })).repeat_until).toBeNull();
  });

  it("반복을 끄면 입력해 둔 끝나는 날을 저장하지 않는다", () => {
    expect(toEventValues(draft({ repeatUntil: "2027-01-01" })).repeat_until).toBeNull();
  });

  it("끝 날짜를 저장하고, 기간이 아니면 null로 둔다", () => {
    expect(toEventValues(draft({ endDate: "2026-11-16" })).end_date).toBe("2026-11-16");
    expect(toEventValues(draft()).end_date).toBeNull();
  });

  it("반복 일정에는 끝 날짜를 저장하지 않는다", () => {
    expect(toEventValues(draft({ repeatRule: "weekly", endDate: "2026-11-16" })).end_date).toBeNull();
  });
});

describe("createEmptyEventDraft", () => {
  it("새 일정은 함께 일정으로 시작한다", () => {
    expect(createEmptyEventDraft("2026-11-14").isTogether).toBe(true);
  });

  it("새 일정은 반복하지 않는다", () => {
    expect(createEmptyEventDraft("2026-11-14")).toMatchObject({ scope: "all", repeatRule: undefined, repeatUntil: "" });
  });

  it("새 일정은 하루 일정으로 시작한다", () => {
    expect(createEmptyEventDraft("2026-11-14").endDate).toBeUndefined();
  });
});

describe("toEventDraft", () => {
  const noRepeat = { repeat_rule: null, repeat_until: null, end_date: null };
  const emptyRepeatDraft = { scope: "all", repeatRule: undefined, repeatUntil: "" };

  it("저장된 일정을 수정 화면 값으로 바꾼다", () => {
    expect(
      toEventDraft({ date: "2026-11-14", start_time: "19:30:00", title: "저녁", place: null, memo: null, is_together: true, ...noRepeat }),
    ).toEqual({ date: "2026-11-14", isAllDay: false, startTime: "19:30", title: "저녁", place: "", memo: "", isTogether: true, ...emptyRepeatDraft });
    expect(
      toEventDraft({ date: "2026-11-14", start_time: null, title: "전시", place: "미술관", memo: "메모", is_together: false, ...noRepeat }),
    ).toEqual({ date: "2026-11-14", isAllDay: true, startTime: "", title: "전시", place: "미술관", memo: "메모", isTogether: false, ...emptyRepeatDraft });
  });

  const repeatingRow = {
    date: "2026-11-14",
    start_time: null,
    title: "수영",
    place: null,
    memo: null,
    is_together: true,
    repeat_rule: "weekly",
    repeat_until: "2027-01-02",
    end_date: null,
  };

  it("기간 일정의 끝 날짜를 수정 화면 값으로 바꾼다", () => {
    expect(toEventDraft({ ...repeatingRow, repeat_rule: null, repeat_until: null, end_date: "2026-11-16" }).endDate).toBe("2026-11-16");
  });

  it("오는 날을 모르면 반복 전체를 고치는 값으로 바꾼다", () => {
    expect(toEventDraft(repeatingRow)).toMatchObject({
      date: "2026-11-14",
      scope: "all",
      repeatRule: "weekly",
      repeatUntil: "2027-01-02",
    });
  });

  it("오는 날을 받으면 그날만 고치는 값으로 바꾼다", () => {
    expect(toEventDraft(repeatingRow, "2026-11-28")).toMatchObject({ date: "2026-11-28", scope: "occurrence", repeatRule: "weekly" });
  });
});

describe("findViewedPeriodDate", () => {
  const period = { date: "2026-10-30", end_date: "2026-11-02" };

  it("주소의 날이 기간 안이면 그날을 돌려준다", () => {
    expect(findViewedPeriodDate(period, "2026-10-30")).toBe("2026-10-30");
    expect(findViewedPeriodDate(period, "2026-11-02")).toBe("2026-11-02");
  });

  it("기간 밖이거나 틀린 값이거나 하루 일정이면 undefined를 돌려준다", () => {
    expect(findViewedPeriodDate(period, "2026-11-03")).toBeUndefined();
    expect(findViewedPeriodDate(period, "2026-02-31")).toBeUndefined();
    expect(findViewedPeriodDate(period, ["2026-11-01", "2026-11-02"])).toBeUndefined();
    expect(findViewedPeriodDate({ date: "2026-10-30", end_date: null }, "2026-10-30")).toBeUndefined();
  });
});

describe("getDateAfterSave", () => {
  it("보고 있던 날이 고친 기간 안이면 그날로 돌아간다", () => {
    expect(getDateAfterSave(draft({ date: "2026-11-14", endDate: "2026-11-16" }), { viewedDate: "2026-11-16" })).toBe("2026-11-16");
  });

  it("보고 있던 날이 기간 밖으로 밀려났으면 시작하는 날로 돌아간다", () => {
    expect(getDateAfterSave(draft({ date: "2026-11-14", endDate: "2026-11-15" }), { viewedDate: "2026-11-16" })).toBe("2026-11-14");
    expect(getDateAfterSave(draft({ date: "2026-11-14" }), { viewedDate: "2026-11-16" })).toBe("2026-11-14");
  });

  it("반복 전체를 고치면 보고 있던 날로, 이 날만 고치면 고친 날로 돌아간다", () => {
    expect(getDateAfterSave(draft({ date: "2026-11-14", scope: "all" }), { occurrenceDate: "2026-11-28" })).toBe("2026-11-28");
    expect(getDateAfterSave(draft({ date: "2026-11-21", scope: "occurrence" }), { occurrenceDate: "2026-11-28" })).toBe("2026-11-21");
  });

  it("보고 있던 날이 없으면 일정 날짜로 돌아간다", () => {
    expect(getDateAfterSave(draft({ date: "2026-11-14" }), {})).toBe("2026-11-14");
  });
});

describe("changeDraftScope", () => {
  const occurrence = { date: "2026-11-28", startDate: "2026-11-14" };

  it("전체를 고르면 시작하는 날을 채운다", () => {
    const changed = changeDraftScope({ draft: draft({ scope: "occurrence", date: "2026-11-28" }), scope: "all", occurrence, isTogether: true, scopeValues: {} });

    expect(changed.draft).toMatchObject({ scope: "all", date: "2026-11-14" });
  });

  it("이 날만을 고르면 누른 날과 반복 전체의 함께 여부로 되돌린다", () => {
    const changed = changeDraftScope({ draft: draft({ date: "2026-11-14", isTogether: false }), scope: "occurrence", occurrence, isTogether: true, scopeValues: {} });

    expect(changed.draft).toMatchObject({ scope: "occurrence", date: "2026-11-28", isTogether: true });
  });

  it("범위를 바꿔도 적어 둔 제목은 남긴다", () => {
    const changed = changeDraftScope({ draft: draft({ title: "수영" }), scope: "all", occurrence, isTogether: true, scopeValues: {} });

    expect(changed.draft.title).toBe("수영");
  });

  it("이 날만에서 옮긴 날짜는 전체에 다녀와도 되살린다", () => {
    // Arrange
    const moved = draft({ scope: "occurrence", date: "2026-11-30" });

    // Act
    const toAll = changeDraftScope({ draft: moved, scope: "all", occurrence, isTogether: true, scopeValues: {} });
    const back = changeDraftScope({ draft: toAll.draft, scope: "occurrence", occurrence, isTogether: true, scopeValues: toAll.scopeValues });

    // Assert
    expect(back.draft.date).toBe("2026-11-30");
  });

  it("전체에서 옮긴 시작 날짜도 이 날만에 다녀와도 되살린다", () => {
    // Arrange
    const moved = draft({ scope: "all", date: "2026-11-07" });

    // Act
    const toOccurrence = changeDraftScope({ draft: moved, scope: "occurrence", occurrence, isTogether: true, scopeValues: {} });
    const back = changeDraftScope({ draft: toOccurrence.draft, scope: "all", occurrence, isTogether: true, scopeValues: toOccurrence.scopeValues });

    // Assert
    expect(toOccurrence.draft.date).toBe("2026-11-28");
    expect(back.draft.date).toBe("2026-11-07");
  });

  it("전체에서 바꾼 함께 여부도 이 날만에 다녀오면 되살린다", () => {
    // Arrange
    const changedOwner = draft({ scope: "all", date: "2026-11-14", isTogether: false });

    // Act
    const toOccurrence = changeDraftScope({ draft: changedOwner, scope: "occurrence", occurrence, isTogether: true, scopeValues: {} });
    const back = changeDraftScope({ draft: toOccurrence.draft, scope: "all", occurrence, isTogether: true, scopeValues: toOccurrence.scopeValues });

    // Assert
    expect(toOccurrence.draft.isTogether).toBe(true);
    expect(back.draft.isTogether).toBe(false);
  });
});

describe("toEditableEvent", () => {
  it("일정 행에서 작성자를 닉네임으로 바꾸고 나머지 값은 그대로 둔다", () => {
    const row = {
      id: "e1",
      date: "2026-11-14",
      start_time: null,
      title: "저녁",
      place: null,
      memo: null,
      is_together: true,
      repeat_rule: null,
      repeat_until: null,
      end_date: null,
      repeat_parent_id: null,
      exceptions: [],
      records: [],
    };
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
      repeat_rule: null,
      repeat_until: null,
      end_date: null,
      repeat_parent_id: null,
      exceptions: [],
      records: [],
      author: null,
    };
    expect(toEditableEvent(row).authorNickname).toBeUndefined();
  });
});

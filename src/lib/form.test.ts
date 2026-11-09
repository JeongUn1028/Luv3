import { describe, expect, it } from "vitest";
import { clearError, countChars, countGraphemes, isIsoDate, isSameFormValue } from "@/lib/form";

describe("countChars", () => {
  it("DB(char_length)처럼 이모지 하나를 한 글자로 센다", () => {
    expect(countChars("가나")).toBe(2);
    expect(countChars("😀")).toBe(1);
  });
});

describe("countGraphemes", () => {
  it("화면에 보이는 글자 단위로 센다", () => {
    expect(countGraphemes("")).toBe(0);
    expect(countGraphemes("가나")).toBe(2);
    expect(countGraphemes("😀")).toBe(1);
    expect(countGraphemes("👨‍👩‍👧‍👦")).toBe(1);
    expect(countGraphemes("🇰🇷")).toBe(1);
  });
});

describe("isIsoDate", () => {
  it("YYYY-MM-DD 형식의 실제 날짜면 참이다", () => {
    expect(isIsoDate("2026-11-02")).toBe(true);
    expect(isIsoDate("2028-02-29")).toBe(true);
  });

  it("형식이 틀리거나 달력에 없는 날이면 거짓이다", () => {
    expect(isIsoDate("")).toBe(false);
    expect(isIsoDate("2026-1-2")).toBe(false);
    expect(isIsoDate("2026-02-31")).toBe(false);
    expect(isIsoDate("2026-02-29")).toBe(false);
    expect(isIsoDate("2026-13-01")).toBe(false);
    expect(isIsoDate("2026-11-00")).toBe(false);
  });
});

describe("clearError", () => {
  it("고친 칸의 에러만 지우고 나머지 에러는 남긴다", () => {
    const errors = { title: "제목을 적어 주세요.", date: "날짜를 골라 주세요.", "caption:p1": "한마디는 100자까지 적을 수 있어요." };
    expect(clearError(errors, "title")).toEqual({ date: "날짜를 골라 주세요.", "caption:p1": "한마디는 100자까지 적을 수 있어요." });
    expect(clearError(errors, "caption:p1")).toEqual({ title: "제목을 적어 주세요.", date: "날짜를 골라 주세요." });
  });

  it("지울 에러가 없으면 같은 객체를 돌려준다(불필요한 다시 그리기 방지)", () => {
    const errors: Partial<Record<"title" | "memo", string>> = { title: "제목을 적어 주세요." };
    expect(clearError(errors, "memo")).toBe(errors);
  });
});

describe("isSameFormValue", () => {
  it("글자·참거짓·배열·객체를 안까지 견줘 모두 같으면 같다고 본다", () => {
    const value = { title: "산책", isAllDay: false, tags: ["카페"], repeatRule: { freq: "weekly", interval: 1 } };

    expect(isSameFormValue(value, { ...value, tags: ["카페"], repeatRule: { freq: "weekly", interval: 1 } })).toBe(true);
    expect(isSameFormValue(value, { ...value, tags: ["카페", "산책"] })).toBe(false);
    expect(isSameFormValue(value, { ...value, repeatRule: { freq: "weekly", interval: 2 } })).toBe(false);
  });

  // 폼은 칸을 펼쳐 고치므로 처음 객체와 칸 순서가 다를 수 있다
  it("칸 순서만 다르거나 값이 undefined인 칸이 없는 칸이면 같다고 본다", () => {
    expect(isSameFormValue({ a: "1", b: undefined }, { a: "1" })).toBe(true);
    expect(isSameFormValue({ b: "2", a: "1" }, { a: "1", b: "2" })).toBe(true);
    expect(isSameFormValue({ a: undefined }, { a: "" })).toBe(false);
  });

  it("배열과 객체를 견주거나 배열 순서가 다르면 다르다고 본다", () => {
    expect(isSameFormValue([], {})).toBe(false);
    expect(isSameFormValue(["a", "b"], ["b", "a"])).toBe(false);
  });
});

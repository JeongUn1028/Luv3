import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { NICKNAME_DB_MAX_CHARS, NICKNAME_MAX_LENGTH, validateNickname } from "./nickname";

describe("validateNickname", () => {
  it.each(["가", "정운", "가나다라마바", "Luv3 💕"])("1~6자 닉네임 %s는 받아들인다", (nickname) => {
    expect(validateNickname(nickname)).toBeUndefined();
  });

  it("비어 있으면 적으라고 안내한다", () => {
    expect(validateNickname("")).toBe("닉네임을 적어 주세요.");
  });

  it.each(["   ", "\t", "　"])("공백만 있으면 비어 있는 것으로 본다", (nickname) => {
    expect(validateNickname(nickname)).toBe("닉네임을 적어 주세요.");
  });

  it.each(["ㅤ", "​", "⠀", "ᅟᅠ", "ㅤ ​"])("보이지 않는 글자만 있으면 비어 있는 것으로 본다", (nickname) => {
    expect(validateNickname(nickname)).toBe("닉네임을 적어 주세요.");
  });

  it.each(["함께", " 함께 "])("일정 종류 이름과 겹치는 %s는 받지 않는다", (nickname) => {
    expect(validateNickname(nickname)).toBe("'함께'는 일정 구분에 쓰는 말이라 닉네임으로 쓸 수 없어요.");
  });

  it("함께가 들어 있기만 한 닉네임은 받아들인다", () => {
    expect(validateNickname("함께해요")).toBeUndefined();
  });

  it("7자면 6자까지라고 안내한다", () => {
    expect(validateNickname("가나다라마바사")).toBe("닉네임은 6자까지 적을 수 있어요.");
  });

  it("앞뒤 공백은 빼고 센다", () => {
    expect(validateNickname("  가나다라마바  ")).toBeUndefined();
  });

  it("가운데 공백은 한 글자로 센다", () => {
    expect(validateNickname("가나 다라 마")).toBe("닉네임은 6자까지 적을 수 있어요.");
  });

  it("합쳐서 그리는 이모지는 화면에 보이는 대로 한 글자로 센다", () => {
    const family = "👨‍👩‍👧‍👦";

    expect(validateNickname(`가나다라마${family}`)).toBeUndefined();
    expect(validateNickname(`가나다라마바${family}`)).toBe("닉네임은 6자까지 적을 수 있어요.");
  });

  it("자모로 나뉜 한글은 합친 글자 하나로 센다", () => {
    expect(validateNickname("가나다라마바".normalize("NFD"))).toBeUndefined();
  });

  it("6자여도 DB가 받지 못할 만큼 길면 저장 전에 안내한다", () => {
    const family = "👨‍👩‍👧‍👦";

    expect(validateNickname(family.repeat(NICKNAME_MAX_LENGTH))).toContain("이모지");
  });
});

describe("DB 제약", () => {
  it("글자 수 상한이 마이그레이션의 check 제약과 같다", () => {
    const migration = readFileSync("supabase/migrations/20261102000000_init_album.sql", "utf8");

    expect(migration).toContain(`check (char_length(nickname) between 1 and ${NICKNAME_DB_MAX_CHARS})`);
  });
});

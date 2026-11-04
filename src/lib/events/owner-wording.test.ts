import { describe, expect, it } from "vitest";
import { readSource, readSourceLines } from "@/test-utils/source";

describe("일정 주인 표시", () => {
  it("화면 문구에 개인이라는 말을 쓰지 않는다", () => {
    const found = readSourceLines().flatMap(({ at, lines }) =>
      lines.flatMap((line, index) => (line.includes("개인") ? [`${at}:${index + 1}`] : [])),
    );

    expect(found).toEqual([]);
  });

  it("일정 추가 폼의 선택지는 현재 사용자의 닉네임을 쓴다", () => {
    expect(readSource("app/events/new/page.tsx")).toContain("ownerNickname={nickname}");
  });

  it("일정 고치기 폼의 선택지는 그 일정 작성자의 닉네임을 쓴다", () => {
    // 상대가 만든 일정에 내 이름을 붙이면 사실과 달라진다. 작성자를 모를 때도 내 닉네임으로 대신하지 않는다
    expect(readSource("app/events/[id]/edit/page.tsx")).toContain("ownerNickname={toOwnerLabel(event.authorNickname)}");
  });

  it("캘린더 범례는 현재 사용자의 닉네임을 쓴다", () => {
    expect(readSource("app/calendar/page.tsx")).toContain("memberNickname={nickname}");
  });

  it("캘린더 일정 줄은 작성자 닉네임을 쓴다", () => {
    expect(readSource("components/events/EventTimeLabel.tsx")).toContain("toOwnerLabel(event.authorNickname)");
  });
});

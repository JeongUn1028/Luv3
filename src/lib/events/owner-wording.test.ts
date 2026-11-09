import { describe, expect, it } from "vitest";
import { readSource, readSourceLines } from "@/test-utils/source";

describe("일정 주인 표시", () => {
  it("화면 문구에서 개인이라는 말은 캘린더 범례 한 곳에만 쓴다", () => {
    const sources = readSourceLines();
    const wordingLines = sources.flatMap(({ at, lines }) =>
      lines.filter((line) => line.includes("개인")).map((line) => `${at}: ${line.trim()}`),
    );
    const legendUsers = sources.filter(({ lines }) => lines.some((line) => line.includes("LEGEND_EVENT_KINDS"))).map(({ at }) => at);

    expect(wordingLines).toEqual(['lib/calendar/highlight.ts: export const LEGEND_EVENT_KINDS: readonly EventKindOption[] = getEventKinds("개인");']);
    expect(legendUsers).toEqual(["components/calendar/CalendarView.tsx", "lib/calendar/highlight.ts"]);
  });

  it("일정 추가 폼의 선택지는 현재 사용자의 닉네임을 쓴다", () => {
    expect(readSource("app/events/new/page.tsx")).toContain("ownerNickname={nickname}");
  });

  it("일정 고치기 폼의 선택지는 그 일정 작성자의 닉네임을 쓴다", () => {
    // 상대가 만든 일정에 내 이름을 붙이면 사실과 달라진다. 작성자를 모를 때도 내 닉네임으로 대신하지 않는다
    expect(readSource("app/events/[id]/edit/page.tsx")).toContain("ownerNickname={toOwnerLabel(event.authorNickname)}");
  });

  it("캘린더 범례는 닉네임을 받지 않고 고정된 이름을 쓴다", () => {
    // 크림색은 두 사람 일정에 모두 칠해져서, 보는 사람 닉네임을 쓰면 상대 일정까지 내 일정처럼 읽힌다
    const calendarView = readSource("components/calendar/CalendarView.tsx");

    expect(calendarView).toContain("LEGEND_EVENT_KINDS.map");
    expect(calendarView).toContain("{label} 일정");
    expect(calendarView).not.toContain("getEventKinds");
    expect(calendarView).not.toContain("memberNickname");
    expect(readSource("app/calendar/page.tsx")).not.toMatch(/nickname/i);
  });

  it("캘린더 일정 줄의 주인 이름표는 홈 일정 칸과 같은 규칙으로 함께 일정과 한 사람 일정을 나눠 쓴다", () => {
    // 함께 일정에 작성자 닉네임을 붙이면 한 사람이 정한 일정처럼 읽힌다(#201). 작성자를 몰라도 한 사람 일정임은 보여 준다
    expect(readSource("components/calendar/CalendarView.tsx")).toContain("<EventOwnerTag isTogether={event.isTogether} authorNickname={event.authorNickname} />");
    expect(readSource("components/AuthorTag.tsx")).toContain("nickname={formatEventOwner({ isTogether, authorNickname })}");
  });
});

import { describe, expect, it } from "vitest";
import { readSource, readSourceLines } from "@/test-utils/source";

// 일정 폼 선택지의 닉네임과 캘린더 범례 이름은 e2e/event-owner.spec.ts가 잰다
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

  it("작성자를 모르는 일정을 고칠 때도 선택지를 내 닉네임으로 대신하지 않는다", () => {
    // 상대 일정에 내 이름을 붙이면 사실과 달라진다. 작성자를 모르는 일정은 E2E 데이터로 만들 수 없어 여기서 고정한다
    expect(readSource("app/events/[id]/edit/page.tsx")).toContain("ownerNickname={toOwnerLabel(event.authorNickname)}");
  });
});

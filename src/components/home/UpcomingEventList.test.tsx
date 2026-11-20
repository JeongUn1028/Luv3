import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { UpcomingEventList } from "@/components/home/UpcomingEventList";
import type { CalendarEvent } from "@/lib/events/calendar";

// 화면 모양은 캡처로 확인한다(홈 칸은 공용 일정이 앞자리를 차지해 E2E가 이은 일정을 띄우지 못한다). Vitest(node)는 HTML로 그려 둘째 줄 글자만 고정한다

const createEvent = (overrides: Partial<CalendarEvent> = {}): CalendarEvent => ({
  id: "e1",
  date: "2026-11-23",
  repeatRule: undefined,
  period: undefined,
  startTime: "19:30:00",
  title: "바다 보러 강릉",
  place: undefined,
  isTogether: true,
  authorNickname: "정운",
  ...overrides,
});

/** 그린 HTML에서 태그를 지운 글자 */
const toText = (html: string): string => html.replace(/<[^>]+>/g, "");

describe("UpcomingEventList", () => {
  it("하고 싶은 것에 이어진 일정은 둘째 줄의 시간·장소 자리에 그 하고 싶은 것을 쓴다(#474)", () => {
    // Arrange
    const events = [createEvent({ place: "주문진 해변", todos: [{ id: "t1", content: "겨울 바다 보러 가기" }] }), createEvent({ id: "e2", title: "영화 보기" })];

    // Act
    const text = toText(renderToStaticMarkup(<UpcomingEventList events={events} today="2026-11-19" />));

    // Assert
    expect(text).toContain("함께 · 4일 뒤 · 하고 싶은 것 겨울 바다 보러 가기");
    expect(text).not.toContain("주문진 해변");
    expect(text).toContain("함께 · 4일 뒤 · 19:30");
  });

  it("하고 싶은 것이 여럿이면 첫 번째와 \"외 N개\"를 쓴다(#495)", () => {
    // Arrange
    const events = [createEvent({ todos: [{ id: "t1", content: "회 먹기" }, { id: "t2", content: "요트 타기" }, { id: "t3", content: "야경 보기" }] })];

    // Act
    const text = toText(renderToStaticMarkup(<UpcomingEventList events={events} today="2026-11-19" />));

    // Assert
    expect(text).toContain("함께 · 4일 뒤 · 하고 싶은 것 회 먹기 외 2개");
    expect(text).not.toContain("요트 타기");
  });
});

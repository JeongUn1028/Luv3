import { describe, expect, it } from "vitest";
import { readSourceLines } from "@/test-utils/source";

// 조회 오류를 문구로 바꾸는 화면과, 그 화면이 값으로 받을 조회·오류 클래스 짝
const LOAD_CALLS = [
  { at: "app/page.tsx", query: "getCouplePhotoUrl", errorClass: "CouplePhotoLoadError" },
  { at: "app/page.tsx", query: "getLatestRecord", errorClass: "AlbumLoadError" },
  { at: "app/page.tsx", query: "getUpcomingEvents", errorClass: "EventLoadError" },
  { at: "app/page.tsx", query: "getTodos", errorClass: "TodoLoadError" },
  { at: "app/records/page.tsx", query: "getAlbumTiles", errorClass: "AlbumLoadError" },
  { at: "app/calendar/page.tsx", query: "getCalendarMonth", errorClass: "EventLoadError" },
  { at: "app/todos/page.tsx", query: "getTodos", errorClass: "TodoLoadError" },
  { at: "app/dates/[id]/page.tsx", query: "getDateRecordDetail", errorClass: "DateRecordLoadError" },
  { at: "app/dates/[id]/edit/page.tsx", query: "getEditableRecord", errorClass: "DateRecordLoadError" },
  { at: "app/events/[id]/edit/page.tsx", query: "getEvent", errorClass: "EventLoadError" },
  { at: "app/todos/[id]/edit/page.tsx", query: "getTodo", errorClass: "TodoLoadError" },
] as const;

const readLines = (at: string): string[] => readSourceLines().find((file) => file.at === at)?.lines ?? [];

describe("화면 조회 오류 처리", () => {
  it.each(LOAD_CALLS)("$at 화면은 $query 실패 중 $errorClass 오류만 값으로 받는다", ({ at, query, errorClass }) => {
    const pattern = new RegExp(`catchLoadError\\(.*\\b${query}\\b.*\\b${errorClass}\\)`);

    expect(readLines(at).some((line) => pattern.test(line))).toBe(true);
  });

  it("catch 문에서 조회 오류를 직접 가려내는 코드를 다시 만들지 않는다", () => {
    const offenders = readSourceLines().flatMap(({ at, lines }) =>
      lines.flatMap((line, index) => (/\berror instanceof \w*LoadError\b/.test(line) ? [`${at}:${index + 1}`] : [])),
    );

    expect(offenders).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";
import { readSourceLines } from "@/test-utils/source";

// 조회 오류를 문구로 바꾸는 화면과, 그 화면이 값으로 받을 조회·오류 클래스 짝
const LOAD_CALLS = [
  { at: "app/page.tsx", query: "getCouplePhoto", errorClass: "CouplePhotoLoadError" },
  { at: "app/page.tsx", query: "getLatestRecord", errorClass: "AlbumLoadError" },
  { at: "app/page.tsx", query: "getUpcomingEvents", errorClass: "EventLoadError" },
  { at: "app/page.tsx", query: "getTodos", errorClass: "TodoLoadError" },
  { at: "app/records/page.tsx", query: "getAlbumFirstPage", errorClass: "AlbumLoadError" },
  { at: "app/api/records/search/route.ts", query: "searchRecords", errorClass: "RecordSearchLoadError" },
  { at: "app/records/map/page.tsx", query: "getMapPins", errorClass: "MapPinLoadError" },
  { at: "app/calendar/page.tsx", query: "getCalendarMonth", errorClass: "EventLoadError" },
  { at: "app/todos/page.tsx", query: "getTodos", errorClass: "TodoLoadError" },
  { at: "app/dates/new/page.tsx", query: "getEventRecordPrefill", errorClass: "EventLoadError" },
  { at: "app/dates/[id]/page.tsx", query: "getDateRecordDetail", errorClass: "DateRecordLoadError" },
  { at: "app/dates/[id]/page.tsx", query: "getRecordComments", errorClass: "CommentLoadError" },
  { at: "app/dates/[id]/page.tsx", query: "getLinkableEvents", errorClass: "EventLoadError" },
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

  it("화면이 부르는 catchLoadError는 모두 위 목록에 있다", () => {
    // 목록에 없는 화면은 위 검사를 받지 않아, 화면을 더할 때 목록을 고치지 않으면 조용히 빠진다(#256)
    const calls = readSourceLines()
      .filter(({ at }) => at.startsWith("app/"))
      .flatMap(({ at, lines }) =>
        lines.flatMap((line, index) => {
          if (!line.includes("catchLoadError(")) return [];
          const match = /catchLoadError\((?:\(\) => )?(\w+)\b.*\b(\w+LoadError)\)/.exec(line);
          // 여러 줄로 나눠 쓰면 짝을 읽지 못한다. 건너뛰지 않고 실패로 알린다
          return [match ? `${at} ${match[1]} ${match[2]}` : `${at}:${index + 1} 한 줄로 읽지 못한 호출`];
        }),
      );
    const listed = LOAD_CALLS.map(({ at, query, errorClass }) => `${at} ${query} ${errorClass}`);

    expect(calls.length).toBeGreaterThan(0);
    expect(calls.filter((call) => !listed.includes(call))).toEqual([]);
  });

  it("catch 문에서 조회 오류를 직접 가려내는 코드를 다시 만들지 않는다", () => {
    const offenders = readSourceLines().flatMap(({ at, lines }) =>
      lines.flatMap((line, index) => (/\berror instanceof \w*LoadError\b/.test(line) ? [`${at}:${index + 1}`] : [])),
    );

    expect(offenders).toEqual([]);
  });
});

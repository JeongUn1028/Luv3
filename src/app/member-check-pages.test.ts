import { describe, expect, it } from "vitest";
import { readSource } from "@/test-utils/source";

// 주석은 지우고 읽는다(readSource). #411 2번: 회원 확인이 끝나기를 기다린 뒤 조회하면 서버 왕복이 한 번 더 든다. 조회가 있는 화면은 확인과 조회를 함께 시작한다(#344)
const PAGES_WITH_LOAD = [
  "app/dates/new/page.tsx",
  "app/dates/[id]/edit/page.tsx",
  "app/events/[id]/edit/page.tsx",
  "app/todos/[id]/edit/page.tsx",
  "app/settings/trash/page.tsx",
  "app/settings/trash/[id]/page.tsx",
  "app/records/map/page.tsx",
] as const;

describe("조회가 있는 화면의 회원 확인", () => {
  it.each(PAGES_WITH_LOAD)("%s는 회원 확인을 기다린 뒤 조회하지 않고 withCurrentMember로 함께 시작한다", (path) => {
    const source = readSource(path);

    expect(source).not.toContain("await getCurrentMember()");
    expect(source).toContain("withCurrentMember(");
  });
});

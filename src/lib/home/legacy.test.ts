import { describe, expect, it } from "vitest";
import { getLegacyHomeRedirect } from "./legacy";

const redirectOf = (path: string): string | undefined => {
  const url = new URL(path, "http://localhost");
  return getLegacyHomeRedirect(url);
};

describe("getLegacyHomeRedirect", () => {
  it("예전 캘린더 주소(/?view=calendar)면 캘린더 탭으로 보낸다", () => {
    expect(redirectOf("/?view=calendar")).toBe("/calendar");
  });

  it("예전 주소의 달과 날을 그대로 넘긴다", () => {
    expect(redirectOf("/?view=calendar&month=2026-12")).toBe("/calendar?month=2026-12");
    expect(redirectOf("/?view=calendar&month=2026-11&date=2026-11-20")).toBe("/calendar?month=2026-11&date=2026-11-20");
  });

  it("날만 있으면 그날이 속한 달을 연다", () => {
    expect(redirectOf("/?view=calendar&date=2026-11-20")).toBe("/calendar?month=2026-11&date=2026-11-20");
  });

  it("홈이나 다른 화면 주소는 넘기지 않는다", () => {
    expect(redirectOf("/")).toBeUndefined();
    expect(redirectOf("/?view=records")).toBeUndefined();
    expect(redirectOf("/calendar?view=calendar")).toBeUndefined();
    expect(redirectOf("/records")).toBeUndefined();
  });
});

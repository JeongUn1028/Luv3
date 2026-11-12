import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { getLastCleanupStart } from "./cleanup-schedule";

describe("getLastCleanupStart", () => {
  it.each([
    ["2026-11-10T12:00:00Z", "2026-11-01T04:00:00.000Z"],
    ["2026-11-01T04:00:00Z", "2026-11-01T04:00:00.000Z"],
    ["2026-11-01T03:59:00Z", "2026-10-01T04:00:00.000Z"],
    ["2026-01-01T03:00:00Z", "2025-12-01T04:00:00.000Z"],
  ])("%s 기준 마지막 정리 시작 시각은 %s다", (now, expected) => {
    expect(getLastCleanupStart(new Date(now)).toISOString()).toBe(expected);
  });

  it("vercel.json의 사진 정리 Cron 예약과 같은 시각을 쓴다", () => {
    const config = JSON.parse(readFileSync(path.join(import.meta.dirname, "../../../vercel.json"), "utf8")) as {
      crons: { path: string; schedule: string }[];
    };

    expect(config.crons.find(({ path: cronPath }) => cronPath === "/api/photo-cleanup")?.schedule).toBe("0 4 1 * *");
  });
});

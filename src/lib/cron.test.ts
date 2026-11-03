import { describe, expect, it } from "vitest";
import { isAuthorizedCronRequest } from "./cron";

const SECRET = "a".repeat(32);

describe("isAuthorizedCronRequest", () => {
  it("Vercel Cron이 보내는 Bearer 비밀 값이 맞으면 허락한다", () => {
    expect(isAuthorizedCronRequest(`Bearer ${SECRET}`, SECRET)).toBe(true);
  });

  it("헤더가 없거나 값·형식이 다르면 거절한다", () => {
    expect(isAuthorizedCronRequest(null, SECRET)).toBe(false);
    expect(isAuthorizedCronRequest(`Bearer ${"b".repeat(32)}`, SECRET)).toBe(false);
    expect(isAuthorizedCronRequest(`Bearer ${SECRET}x`, SECRET)).toBe(false);
    expect(isAuthorizedCronRequest(SECRET, SECRET)).toBe(false);
  });

  it("서버에 비밀 값이 없거나 너무 짧으면 누구도 허락하지 않는다", () => {
    expect(isAuthorizedCronRequest("Bearer ", undefined)).toBe(false);
    expect(isAuthorizedCronRequest("Bearer ", "")).toBe(false);
    expect(isAuthorizedCronRequest("Bearer short", "short")).toBe(false);
  });
});

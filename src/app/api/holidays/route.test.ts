import { afterEach, describe, expect, it, vi } from "vitest";
import { getCurrentMember } from "@/lib/auth/member";
import { getHolidays } from "@/lib/holidays/server";
import { GET } from "./route";

vi.mock("@/lib/auth/member", () => ({ getCurrentMember: vi.fn() }));
vi.mock("@/lib/holidays/server", () => ({ getHolidays: vi.fn() }));

const requestWith = (year: string): Request => new Request(`http://localhost/api/holidays?${new URLSearchParams({ year }).toString()}`);

describe("GET /api/holidays", () => {
  afterEach(() => {
    vi.mocked(getCurrentMember).mockReset();
    vi.mocked(getHolidays).mockReset();
  });

  it("멤버가 아니면 공휴일을 묻지 않고 멤버 확인의 이동을 그대로 따른다", async () => {
    // Arrange
    const redirect = new Error("NEXT_REDIRECT");
    vi.mocked(getCurrentMember).mockRejectedValue(redirect);

    // Act & Assert
    await expect(GET(requestWith("2026"))).rejects.toBe(redirect);
    expect(getHolidays).not.toHaveBeenCalled();
  });

  it("그해 공휴일을 돌려주고 응답을 저장해 두지 않게 한다", async () => {
    // Arrange
    vi.mocked(getHolidays).mockResolvedValue([{ date: "2026-05-05", name: "어린이날" }]);

    // Act
    const response = await GET(requestWith("2026"));

    // Assert
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({ holidays: [{ date: "2026-05-05", name: "어린이날" }] });
    expect(getHolidays).toHaveBeenCalledWith(2026);
  });

  it("잘못된 해는 묻지 않고 400을 돌려준다", async () => {
    // Act
    const response = await GET(requestWith("1800"));

    // Assert
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code: "INVALID_YEAR" });
    expect(getHolidays).not.toHaveBeenCalled();
  });

  // 브라우저가 실패를 그해의 빈 답으로 기억하지 않게 한다
  it("공휴일을 받지 못하면 502를 돌려준다", async () => {
    // Arrange
    vi.mocked(getHolidays).mockResolvedValue(undefined);

    // Act
    const response = await GET(requestWith("2026"));

    // Assert
    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({ code: "HOLIDAYS_FAILED" });
  });
});

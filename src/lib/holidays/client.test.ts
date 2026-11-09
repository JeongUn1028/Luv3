import { afterEach, describe, expect, it, vi } from "vitest";
import { clearHolidayNamesCache, loadHolidayNames } from "./client";

describe("loadHolidayNames", () => {
  afterEach(() => {
    clearHolidayNamesCache();
  });

  it("우리 API에서 그해 공휴일을 받아 날짜마다 이름으로 모은다", async () => {
    // Arrange
    const fetcher = vi.fn(async () => Response.json({ holidays: [{ date: "2026-05-05", name: "어린이날" }] }));

    // Act
    const names = await loadHolidayNames(2026, fetcher);

    // Assert
    expect(names).toEqual({ "2026-05-05": "어린이날" });
    expect(fetcher).toHaveBeenCalledWith("/api/holidays?year=2026");
  });

  it("같은 해는 다시 묻지 않는다", async () => {
    // Arrange
    const fetcher = vi.fn(async () => Response.json({ holidays: [] }));

    // Act
    await loadHolidayNames(2026, fetcher);
    await loadHolidayNames(2026, fetcher);

    // Assert
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("한 시간이 지나면 같은 해도 다시 묻는다", async () => {
    // Arrange
    let now = 0;
    const fetcher = vi.fn(async () => Response.json({ holidays: [] }));

    // Act
    await loadHolidayNames(2026, fetcher, () => now);
    now = 60 * 60 * 1000 - 1;
    await loadHolidayNames(2026, fetcher, () => now);
    now = 60 * 60 * 1000;
    await loadHolidayNames(2026, fetcher, () => now);

    // Assert
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("받지 못한 해는 기억하지 않고 다음에 다시 묻는다", async () => {
    // Arrange
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("{}", { status: 502 }))
      .mockResolvedValueOnce(Response.json({ holidays: [{ date: "2026-05-05", name: "어린이날" }] }));

    // Act & Assert
    await expect(loadHolidayNames(2026, fetcher)).rejects.toMatchObject({ name: "HolidayLoadError", status: 502 });
    await expect(loadHolidayNames(2026, fetcher)).resolves.toEqual({ "2026-05-05": "어린이날" });
  });
});

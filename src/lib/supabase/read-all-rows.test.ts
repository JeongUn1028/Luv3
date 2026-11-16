import { describe, expect, it, vi } from "vitest";
import { readAllRows } from "./read-all-rows";

class LoadTestError extends Error {}
const toError = (cause: unknown) => new LoadTestError("읽지 못함", { cause });

describe("readAllRows", () => {
  const ids = ["a", "b", "c", "d", "e"];
  /** id 순 표. `limit`보다 적게 주는 서버(한 번 최대 행 수가 작은 설정)도 흉내 낸다 */
  const fetchFrom = (rows: string[], serverMaxRows = Infinity) =>
    vi.fn(async (afterId: string | undefined, limit: number) => ({
      data: rows.filter((id) => afterId === undefined || id > afterId).slice(0, Math.min(limit, serverMaxRows)).map((id) => ({ id })),
      error: null,
    }));

  it("요청한 수만큼 찬 쪽이 오면 마지막 id 다음부터 이어서 읽고, 덜 찬 쪽에서 멈춰 모두 합친다", async () => {
    // Arrange
    const fetchPage = fetchFrom(ids);

    // Act
    const rows = await readAllRows({ fetchPage, toError, pageSize: 2 });

    // Assert
    expect(rows.map(({ id }) => id)).toEqual(ids);
    expect(fetchPage.mock.calls).toEqual([
      [undefined, 2],
      ["b", 2],
      ["d", 2],
    ]);
  });

  it("행이 쪽 크기보다 적으면 한 번만 읽고 빈 쪽을 더 묻지 않는다(#344)", async () => {
    // Arrange
    const fetchPage = fetchFrom(["a", "b"]);

    // Act
    const rows = await readAllRows({ fetchPage, toError });

    // Assert
    expect(rows.map(({ id }) => id)).toEqual(["a", "b"]);
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  it("마지막 쪽이 딱 맞게 차면 끝인지 알 수 없어 한 번 더 읽는다", async () => {
    // Arrange
    const fetchPage = fetchFrom(["a", "b", "c", "d"]);

    // Act
    const rows = await readAllRows({ fetchPage, toError, pageSize: 2 });

    // Assert
    expect(rows.map(({ id }) => id)).toEqual(["a", "b", "c", "d"]);
    expect(fetchPage.mock.calls).toEqual([
      [undefined, 2],
      ["b", 2],
      ["d", 2],
    ]);
  });

  it("기본 쪽 크기는 Supabase 한 번 최대 행 수(1000)보다 크지 않아, 서버가 잘라 준 쪽을 끝으로 잘못 보지 않는다", async () => {
    // Arrange
    const many = Array.from({ length: 1200 }, (_, index) => String(index).padStart(4, "0"));
    const fetchPage = fetchFrom(many, 1000);

    // Act
    const rows = await readAllRows({ fetchPage, toError });

    // Assert
    expect(rows).toHaveLength(1200);
    expect(fetchPage.mock.calls[0]?.[1]).toBeLessThanOrEqual(1000);
  });

  it("읽는 사이 앞쪽 행이 지워져도 남은 행을 건너뛰지 않는다", async () => {
    const table = [...ids];
    const fetchPage = vi.fn(async (afterId: string | undefined, limit: number) => {
      const data = table.filter((id) => afterId === undefined || id > afterId).slice(0, limit).map((id) => ({ id }));
      // 첫 쪽을 읽은 직후 상대가 앞쪽 행을 지운다
      if (afterId === undefined) table.splice(0, 1);
      return { data, error: null };
    });

    const rows = await readAllRows({ fetchPage, toError, pageSize: 2 });

    expect(rows.map(({ id }) => id)).toEqual(ids);
  });

  it("한 쪽이라도 읽지 못하면 DB 에러를 원인으로 담아 toError가 만든 에러를 던진다", async () => {
    // Arrange
    const dbError = { message: "timeout", code: "57014" };
    const fetchPage = async () => ({ data: null, error: dbError });

    // Act
    const failure: unknown = await readAllRows({ fetchPage, toError }).catch((error: unknown) => error);

    // Assert
    expect(failure).toBeInstanceOf(LoadTestError);
    expect(failure instanceof LoadTestError && failure.cause).toBe(dbError);
  });
});

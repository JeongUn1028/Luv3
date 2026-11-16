import { afterEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@/lib/supabase/server";
import { getOpenTodoPreview, TodoLoadError } from "./queries";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

interface QueryResult {
  data: unknown[] | null;
  error: { message: string } | null;
}

/** 부른 조건을 차례로 적고, 끝에 await하면 정한 결과를 주는 가짜 쿼리 */
const fakeSupabase = (result: QueryResult) => {
  const calls: [string, ...unknown[]][] = [];
  const query = {
    select: (...args: unknown[]) => (calls.push(["select", ...args]), query),
    is: (...args: unknown[]) => (calls.push(["is", ...args]), query),
    order: (...args: unknown[]) => (calls.push(["order", ...args]), query),
    limit: (...args: unknown[]) => (calls.push(["limit", ...args]), query),
    then: (resolve: (value: QueryResult) => unknown) => Promise.resolve(result).then(resolve),
  };
  const client = { from: (table: string) => (calls.push(["from", table]), query) };
  vi.mocked(createClient).mockResolvedValue(client as unknown as Awaited<ReturnType<typeof createClient>>);
  return calls;
};

describe("getOpenTodoPreview", () => {
  afterEach(() => {
    vi.mocked(createClient).mockReset();
  });

  it("하지 않은 항목만 정한 순서대로 요청한 개수만큼 받는다(#344)", async () => {
    // Arrange
    const calls = fakeSupabase({
      data: [{ id: "a", content: "바다 보기", sort_order: 1, completed_at: null, revision: "r1" }],
      error: null,
    });

    // Act
    const todos = await getOpenTodoPreview(3);

    // Assert
    expect(todos).toEqual([{ id: "a", content: "바다 보기", sortOrder: 1, completedAt: undefined, revision: "r1" }]);
    expect(calls).toEqual([
      ["from", "todos"],
      ["select", "id, content, sort_order, completed_at, revision"],
      ["is", "completed_at", null],
      ["order", "sort_order"],
      ["order", "id"],
      ["limit", 3],
    ]);
  });

  it("조회가 실패하면 DB 에러를 원인으로 담은 TodoLoadError를 던진다", async () => {
    // Arrange
    const dbError = { message: "timeout" };
    fakeSupabase({ data: null, error: dbError });

    // Act
    const failure: unknown = await getOpenTodoPreview(3).catch((error: unknown) => error);

    // Assert
    expect(failure).toBeInstanceOf(TodoLoadError);
    expect(failure instanceof TodoLoadError && failure.cause).toBe(dbError);
  });
});

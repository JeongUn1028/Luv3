import { afterEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@/lib/supabase/server";
import { getLinkableTodosByIds, getOpenTodoPreview, TodoLoadError } from "./queries";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

interface QueryResult {
  data: unknown[] | null;
  error: { message: string } | null;
}

/** 부른 조건을 차례로 적고, 끝에 await하면 정한 결과를 주는 가짜 쿼리. 결과를 여러 개 주면 쿼리마다 차례로 준다 */
const fakeSupabase = (...results: QueryResult[]) => {
  const calls: [string, ...unknown[]][] = [];
  let resultIndex = 0;
  const query = {
    select: (...args: unknown[]) => (calls.push(["select", ...args]), query),
    is: (...args: unknown[]) => (calls.push(["is", ...args]), query),
    in: (...args: unknown[]) => (calls.push(["in", ...args]), query),
    order: (...args: unknown[]) => (calls.push(["order", ...args]), query),
    limit: (...args: unknown[]) => (calls.push(["limit", ...args]), query),
    then: (resolve: (value: QueryResult) => unknown) => {
      const result = results[Math.min(resultIndex, results.length - 1)] ?? { data: null, error: { message: "정한 결과가 없습니다" } };
      resultIndex += 1;
      return Promise.resolve(result).then(resolve);
    },
  };
  const client = { from: (table: string) => (calls.push(["from", table]), query) };
  vi.mocked(createClient).mockResolvedValue(client as unknown as Awaited<ReturnType<typeof createClient>>);
  return calls;
};

describe("getOpenTodoPreview", () => {
  afterEach(() => {
    vi.mocked(createClient).mockReset();
  });

  it("일정이 없는 하지 않은 항목만 정한 순서대로 요청한 개수만큼 받는다(#344·#497)", async () => {
    // Arrange
    const calls = fakeSupabase({
      data: [{ id: "a", content: "바다 보기", sort_order: 1, completed_at: null, revision: "r1" }],
      error: null,
    });

    // Act
    const preview = await getOpenTodoPreview(3);

    // Assert
    expect(preview).toEqual({ todos: [{ id: "a", content: "바다 보기", sortOrder: 1, completedAt: undefined, revision: "r1" }], isAllScheduled: false });
    expect(calls).toEqual([
      ["from", "todos"],
      ["select", "id, content, sort_order, completed_at, revision"],
      ["is", "completed_at", null],
      ["is", "event_id", null],
      ["order", "sort_order"],
      ["order", "id"],
      ["limit", 3],
    ]);
  });

  it("'아직'이 비었는데 하지 않은 항목이 있으면 모두 일정이 잡혔다고 알린다(#497)", async () => {
    // Arrange
    const calls = fakeSupabase({ data: [], error: null }, { data: [{ id: "scheduled" }], error: null });

    // Act
    const preview = await getOpenTodoPreview(3);

    // Assert
    expect(preview).toEqual({ todos: [], isAllScheduled: true });
    expect(calls.slice(7)).toEqual([
      ["from", "todos"],
      ["select", "id"],
      ["is", "completed_at", null],
      ["limit", 1],
    ]);
  });

  it("하지 않은 항목이 하나도 없으면 빈 목록으로 알린다", async () => {
    fakeSupabase({ data: [], error: null }, { data: [], error: null });

    expect(await getOpenTodoPreview(3)).toEqual({ todos: [], isAllScheduled: false });
  });

  it("하지 않은 항목이 있는지 읽지 못해도 TodoLoadError를 던진다", async () => {
    // Arrange
    const dbError = { message: "timeout" };
    fakeSupabase({ data: [], error: null }, { data: null, error: dbError });

    // Act
    const failure: unknown = await getOpenTodoPreview(3).catch((error: unknown) => error);

    // Assert
    expect(failure instanceof TodoLoadError && failure.cause).toBe(dbError);
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

describe("getLinkableTodosByIds", () => {
  afterEach(() => {
    vi.mocked(createClient).mockReset();
  });

  it("고른 id 중 일정이 없고 완료하지 않은 것만 목록 순서대로 개수 제한 없이 받는다(#495)", async () => {
    // Arrange
    const rows = [{ id: "a", content: "회 먹기" }];
    const calls = fakeSupabase({ data: rows, error: null });

    // Act
    const todos = await getLinkableTodosByIds(["a", "b"]);

    // Assert
    expect(todos).toEqual(rows);
    expect(calls).toEqual([
      ["from", "todos"],
      ["select", "id, content"],
      ["in", "id", ["a", "b"]],
      ["is", "completed_at", null],
      ["is", "event_id", null],
      ["order", "sort_order"],
      ["order", "id"],
    ]);
  });

  it("조회가 실패하면 TodoLoadError를 던진다", async () => {
    // Arrange
    fakeSupabase({ data: null, error: { message: "boom" } });

    // Act & Assert
    await expect(getLinkableTodosByIds(["a"])).rejects.toBeInstanceOf(TodoLoadError);
  });
});

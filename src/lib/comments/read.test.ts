import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import type { Database } from "@/lib/supabase/database.types";
import { CommentLoadError, readRecordComments } from "./read";

const RECORD_ID = "20000000-0000-4000-8000-000000000002";

interface QueryResult {
  data: unknown[] | null;
  error: { message: string } | null;
}

/** 부른 조건을 차례로 적고, 끝에 await하면 정한 결과를 주는 가짜 클라이언트 */
const fakeSupabase = (result: QueryResult) => {
  const calls: [string, ...unknown[]][] = [];
  const query = {
    select: (...args: unknown[]) => (calls.push(["select", ...args]), query),
    eq: (...args: unknown[]) => (calls.push(["eq", ...args]), query),
    order: (...args: unknown[]) => (calls.push(["order", ...args]), query),
    then: (resolve: (value: QueryResult) => unknown) => Promise.resolve(result).then(resolve),
  };
  const client = { from: (table: string) => (calls.push(["from", table]), query) };
  return { supabase: client as unknown as SupabaseClient<Database>, calls };
};

describe("readRecordComments", () => {
  it("기록 하나의 댓글을 작성자 닉네임과 함께 남긴 순서대로 읽는다", async () => {
    // Arrange
    const row = { id: "c1", content: "좋았다", created_at: "2026-11-18T01:00:00Z", author_id: "m1", author: { nickname: "진아" } };
    const { supabase, calls } = fakeSupabase({ data: [row], error: null });

    // Act
    const rows = await readRecordComments(supabase, RECORD_ID);

    // Assert
    expect(rows).toEqual([row]);
    expect(calls).toEqual([
      ["from", "comments"],
      ["select", "id, content, created_at, author_id, author:members!comments_author_id_fkey(nickname)"],
      ["eq", "date_id", RECORD_ID],
      ["order", "created_at"],
      ["order", "id"],
    ]);
  });

  it("id 형식이 틀리면 묻지 않고 빈 목록을 준다", async () => {
    const { supabase, calls } = fakeSupabase({ data: [], error: null });

    expect(await readRecordComments(supabase, "not-a-uuid")).toEqual([]);
    expect(calls).toEqual([]);
  });

  it("조회가 실패하면 원인을 담은 CommentLoadError를 던진다", async () => {
    // Arrange
    const cause = { message: "boom" };
    const { supabase } = fakeSupabase({ data: null, error: cause });

    // Act
    const reading = readRecordComments(supabase, RECORD_ID);

    // Assert
    await expect(reading).rejects.toBeInstanceOf(CommentLoadError);
    await expect(reading).rejects.toMatchObject({ cause });
  });
});

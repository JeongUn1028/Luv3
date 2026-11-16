import { describe, expect, it, vi } from "vitest";
import { deleteRowById, type DeletableTable } from "./delete-row";

const ROW_ID = "10000000-0000-4000-8000-000000000001";

/** 지운 id를 기록하고 정해 둔 결과를 돌려주는 가짜 표 */
const createFakeTable = (error: { message: string } | null = null) => {
  const eq = vi.fn(async () => ({ error }));
  const table: DeletableTable = { delete: () => ({ eq }) };
  return { table, eq };
};

describe("deleteRowById", () => {
  it("id 칸으로 행을 지운다", async () => {
    // Arrange
    const { table, eq } = createFakeTable();

    // Act
    await deleteRowById({ table, id: ROW_ID, subject: "댓글을" });

    // Assert
    expect(eq).toHaveBeenCalledWith("id", ROW_ID);
  });

  it("지우지 못하면 대상과 원인을 담아 던진다", async () => {
    // Arrange
    const cause = { message: "rls" };
    const { table } = createFakeTable(cause);

    // Act
    const result = deleteRowById({ table, id: ROW_ID, subject: "하고 싶은 것을" });

    // Assert
    await expect(result).rejects.toThrow("하고 싶은 것을 지우지 못했습니다: rls");
    await expect(result).rejects.toMatchObject({ cause });
  });
});

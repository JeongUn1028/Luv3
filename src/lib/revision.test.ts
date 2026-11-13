import { describe, expect, it } from "vitest";
import { saveRowAtRevision, toFailedSaveFields, type RevisionedTable } from "./revision";

interface Calls {
  insert: unknown[];
  update: { values: unknown; id: string; revisions: string[] }[];
  read: string[];
}

interface FakeTableParams {
  insertError?: { message: string; code?: string };
  updatedRows?: { id: string }[];
  isRowThere?: boolean;
}

/** 부른 값을 기록하고 정해 둔 결과를 돌려주는 가짜 표 */
const createFakeTable = ({ insertError, updatedRows = [{ id: "row" }], isRowThere = true }: FakeTableParams = {}) => {
  const calls: Calls = { insert: [], update: [], read: [] };
  const table: RevisionedTable<{ content: string }> = {
    insert: async (row) => {
      calls.insert.push(row);
      return { error: insertError ?? null };
    },
    update: (values) => ({
      eq: (_column, id) => ({
        in: (_revisionColumn, revisions) => ({
          select: async () => {
            calls.update.push({ values, id, revisions: [...revisions] });
            return { data: updatedRows, error: null };
          },
        }),
      }),
    }),
    select: () => ({
      eq: (_column, id) => ({
        maybeSingle: async () => {
          calls.read.push(id);
          return { data: isRowThere ? { id } : null, error: null };
        },
      }),
    }),
  };
  return { table, calls };
};

describe("toFailedSaveFields", () => {
  const MAY_HAVE_SAVED = { hasConflict: false, mayHaveSaved: true };
  const NOT_SAVED = { hasConflict: false, mayHaveSaved: false };

  it("상대가 고쳐 거부됐으면 그 사실을 남긴다", () => {
    expect(toFailedSaveFields({ failure: { hasConflict: true, mayHaveSaved: false }, expectedRevisions: ["r1"], revision: "r2" })).toEqual({
      hasConflict: true,
      expectedRevisions: ["r1"],
    });
  });

  it("저장됐을 수 있으면 이번 판 번호를 허용 목록 끝에 더해 다음 저장이 내 판으로 거부되지 않게 한다", () => {
    expect(toFailedSaveFields({ failure: MAY_HAVE_SAVED, expectedRevisions: ["r1"], revision: "r2" }).expectedRevisions).toEqual(["r1", "r2"]);
  });

  it("허용 목록이 없을 때 저장됐을 수 있으면 이번 판 번호만 담는다", () => {
    expect(toFailedSaveFields({ failure: MAY_HAVE_SAVED, expectedRevisions: undefined, revision: "r2" }).expectedRevisions).toEqual(["r2"]);
  });

  it("저장되지 않은 것이 분명하면 허용 목록을 그대로 둔다", () => {
    const expectedRevisions = ["r1"];

    expect(toFailedSaveFields({ failure: NOT_SAVED, expectedRevisions, revision: "r2" }).expectedRevisions).toBe(expectedRevisions);
  });

  it("이번 판 번호가 없으면(새로 만드는 기록) 허용 목록을 그대로 둔다", () => {
    expect(toFailedSaveFields({ failure: MAY_HAVE_SAVED, expectedRevisions: undefined, revision: undefined }).expectedRevisions).toBeUndefined();
  });
});

describe("saveRowAtRevision", () => {
  it("고칠 행은 불러온 판과 이번 판일 때만 이번 내용과 판 번호로 고친다", async () => {
    // Arrange
    const { table, calls } = createFakeTable();

    // Act
    const outcome = await saveRowAtRevision({ table, rowId: "t1", newRowId: "n1", values: { content: "벚꽃" }, expectedRevisions: ["r1"], revision: "r2" });

    // Assert
    expect(outcome).toBe("saved");
    expect(calls.update).toEqual([{ values: { content: "벚꽃", revision: "r2" }, id: "t1", revisions: ["r1", "r2"] }]);
    expect(calls.insert).toEqual([]);
  });

  it("고칠 행이 바뀌지 않았는데 행이 남아 있으면 그사이 바뀐 것이라 conflict다", async () => {
    const { table, calls } = createFakeTable({ updatedRows: [] });

    const outcome = await saveRowAtRevision({ table, rowId: "t1", newRowId: "n1", values: { content: "벚꽃" }, expectedRevisions: ["r1"], revision: "r2" });

    expect(outcome).toBe("conflict");
    expect(calls.read).toEqual(["t1"]);
  });

  it("고칠 행이 바뀌지 않았고 행도 없으면 그사이 지워진 것이라 gone이다", async () => {
    const { table } = createFakeTable({ updatedRows: [], isRowThere: false });

    const outcome = await saveRowAtRevision({ table, rowId: "t1", newRowId: "n1", values: { content: "벚꽃" }, expectedRevisions: ["r1"], revision: "r2" });

    expect(outcome).toBe("gone");
  });

  it("고칠 행이 없으면 새 id와 이번 판 번호로 만든다", async () => {
    // Arrange
    const { table, calls } = createFakeTable();

    // Act
    const outcome = await saveRowAtRevision({ table, rowId: undefined, newRowId: "n1", values: { content: "벚꽃" }, expectedRevisions: undefined, revision: "r2" });

    // Assert
    expect(outcome).toBe("saved");
    expect(calls.insert).toEqual([{ content: "벚꽃", revision: "r2", id: "n1" }]);
    expect(calls.update).toEqual([]);
  });

  it("만들 때 같은 id가 이미 있으면 앞선 시도의 행을 이번 판 번호까지 허용해 고친다", async () => {
    // Arrange
    const { table, calls } = createFakeTable({ insertError: { message: "중복", code: "23505" } });

    // Act
    const outcome = await saveRowAtRevision({ table, rowId: undefined, newRowId: "n1", values: { content: "벚꽃" }, expectedRevisions: ["r1"], revision: "r2" });

    // Assert
    expect(outcome).toBe("saved");
    expect(calls.update).toEqual([{ values: { content: "벚꽃", revision: "r2" }, id: "n1", revisions: ["r1", "r2"] }]);
  });
});

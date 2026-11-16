import type { RevisionedTable } from "@/lib/revision";
import type { SaveErrorCode, UpdatedRows } from "@/lib/save-outcome";

/** 가짜 표가 받은 요청 */
interface RevisionedTableCalls {
  insert: unknown[];
  update: { values: unknown; id: string; revisions: string[] }[];
  read: string[];
}

interface CreateFakeRevisionedTableParams {
  insertError?: SaveErrorCode & { message?: string };
  /** 고치기 요청이 차례로 돌려줄 결과. 다 쓰면 마지막 결과를 계속 돌려준다. 없으면 한 행을 고친 것으로 본다 */
  updateResults?: UpdatedRows[];
  /** 고친 행이 없을 때 다시 읽으면 행이 있는지 */
  isRowThere?: boolean;
}

/**
 * 부른 값을 기록하고 정해 둔 결과를 돌려주는 판 번호 표(`RevisionedTable`). 저장 함수 테스트가 함께 쓴다.
 *
 * @example const { table, calls } = createFakeRevisionedTable<{ content: string }>({ updateResults: [{ data: [], error: null }] });
 */
export const createFakeRevisionedTable = <Values>({ insertError, updateResults = [{ data: [{ id: "row" }], error: null }], isRowThere = true }: CreateFakeRevisionedTableParams = {}): {
  table: RevisionedTable<Values>;
  calls: RevisionedTableCalls;
} => {
  const calls: RevisionedTableCalls = { insert: [], update: [], read: [] };
  const table: RevisionedTable<Values> = {
    insert: async (row) => {
      calls.insert.push(row);
      return { error: insertError ?? null };
    },
    update: (values) => ({
      eq: (_column, id) => ({
        in: (_revisionColumn, revisions) => ({
          select: async () => {
            calls.update.push({ values, id, revisions: [...revisions] });
            const result = updateResults[Math.min(calls.update.length, updateResults.length) - 1];
            return result ?? { data: [], error: null };
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

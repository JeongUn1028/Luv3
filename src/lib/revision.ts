import { createRowWithRetry, updateRowWithRetry, type SaveErrorCode, type SaveFailure, type SaveOutcome, type UpdatedRows } from "@/lib/save-outcome";

// 판 번호(#161): 저장할 때마다 앱이 새 판 번호를 정하고, 고치기는 "불러온 판 또는 저장됐을 수 있는 내 판"일 때만 받는다.
// 화면을 연 뒤 상대가 저장했으면 판 번호가 달라 거부되고, 폼은 최신 내용을 불러오게 한다

interface AddMaybeSavedRevisionParams<Expected extends string[] | undefined> {
  /** 지금까지 저장해도 되는 판 번호(불러온 판, 앞선 시도의 판) */
  expectedRevisions: Expected;
  /** 방금 실패한 시도의 판 번호. 새로 만드는 기록처럼 판 번호를 보내지 않았으면 undefined */
  revision: string | undefined;
  /** 방금 시도가 서버에 저장됐을 수 있는지 */
  mayHaveSaved: boolean;
}

/**
 * 저장에 실패한 뒤 다음 시도에서 허용할 판 번호. 저장됐을 수 있는 내 판은 상대의 저장으로 오해하지 않게 더한다.
 * 폼은 상대가 고쳤는지까지 함께 담는 `toFailedSaveFields`를 쓴다
 */
const addMaybeSavedRevision = <Expected extends string[] | undefined>({
  expectedRevisions,
  revision,
  mayHaveSaved,
}: AddMaybeSavedRevisionParams<Expected>): Expected | string[] =>
  mayHaveSaved && revision ? [...(expectedRevisions ?? []), revision] : expectedRevisions;

interface ToFailedSaveFieldsParams<Expected extends string[] | undefined> {
  failure: Pick<SaveFailure, "hasConflict" | "mayHaveSaved">;
  /** 방금 시도에서 저장해도 된다고 보낸 판 번호 */
  expectedRevisions: Expected;
  /** 방금 시도의 판 번호. 새로 만드는 기록처럼 보내지 않았으면 undefined */
  revision: string | undefined;
}

/**
 * 저장에 실패한 폼이 다음 시도를 위해 기억할 칸. 기록·일정·할 일 폼이 함께 쓴다(#315).
 * 상대가 고쳤으면 저장 대신 최신 내용을 불러오게 하고, 저장됐을 수 있는 내 판은 허용 목록에 더한다.
 *
 * @example setDraft((current) => ({ ...current, ...toFailedSaveFields({ failure, expectedRevisions: draft.expectedRevisions, revision }) }))
 */
export const toFailedSaveFields = <Expected extends string[] | undefined>({
  failure,
  expectedRevisions,
  revision,
}: ToFailedSaveFieldsParams<Expected>): { hasConflict: boolean; expectedRevisions: Expected | string[] } => ({
  hasConflict: failure.hasConflict,
  expectedRevisions: addMaybeSavedRevision({ expectedRevisions, revision, mayHaveSaved: failure.mayHaveSaved }),
});

/**
 * 판 번호 칸이 있는 표에서 이 파일이 쓰는 요청들. Supabase의 `createClient().from("todos")`가 이 모양이다.
 * 테스트는 같은 모양의 가짜를 넘긴다.
 */
export interface RevisionedTable<Values> {
  insert: (row: Values & { id: string; revision: string }) => PromiseLike<{ error: SaveErrorCode | null }>;
  update: (values: Values & { revision: string }) => {
    eq: (column: "id", value: string) => { in: (column: "revision", values: string[]) => { select: (columns: "id") => PromiseLike<UpdatedRows> } };
  };
  select: (columns: "id") => {
    eq: (column: "id", value: string) => { maybeSingle: () => PromiseLike<{ data: unknown; error: SaveErrorCode | null }> };
  };
}

interface SaveRowAtRevisionParams<Values> {
  table: RevisionedTable<Values>;
  /** 고칠 행의 id. 없으면 `newRowId`로 새로 만든다 */
  rowId: string | undefined;
  /** 새 행에 쓸 id. 다시 저장할 때 앞선 시도와 같은 값을 넘겨 행이 둘이 되지 않게 한다 */
  newRowId: string;
  /** 저장할 값(판 번호 빼고) */
  values: Values;
  /** 저장해도 되는 판 번호: 불러온 판과, 저장됐을 수 있는 내 앞선 시도의 판 */
  expectedRevisions: string[] | undefined;
  /** 이번 저장으로 바뀔 판 번호. 시도마다 새로 만든다 */
  revision: string;
}

/**
 * 판 번호를 확인하며 행 하나를 고치거나 만든다. 응답만 끊기면 한 번 더 보내고(`updateRowWithRetry`·`createRowWithRetry`),
 * 화면을 연 뒤 상대가 고쳤으면 `conflict`, 그사이 지워졌으면 `gone`이다.
 *
 * @example
 * const outcome = await saveRowAtRevision({ table: createClient().from("todos"), rowId: todoId, newRowId, values: { content }, expectedRevisions, revision });
 */
export const saveRowAtRevision = <Values>({ table, rowId, newRowId, values, expectedRevisions, revision }: SaveRowAtRevisionParams<Values>): Promise<SaveOutcome> => {
  const row = { ...values, revision };
  // 불러온 판과 내 앞선 시도의 판만 허용한다. 내 이번 판도 허용해야 응답만 끊긴 요청을 그대로 다시 보낼 수 있다
  const allowedRevisions = [...(expectedRevisions ?? []), revision];
  const update = (id: string) => () => table.update(row).eq("id", id).in("revision", allowedRevisions).select("id");
  const readRow = (id: string) => () => table.select("id").eq("id", id).maybeSingle();
  if (rowId) return updateRowWithRetry({ update: update(rowId), readRow: readRow(rowId) });
  return createRowWithRetry({ insert: () => table.insert({ ...row, id: newRowId }), update: update(newRowId), readRow: readRow(newRowId) });
};

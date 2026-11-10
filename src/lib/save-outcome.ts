/** 저장 요청이 돌려준 오류에서 판단에 쓰는 부분. Supabase의 PostgREST 오류와 RPC 오류 모두 이 모양이다 */
export interface SaveErrorCode {
  code?: string;
}

/**
 * 처리하지 않고 거절한 것이 분명한 오류: 데이터·제약(22, 23), 권한·문법(42), 함수의 raise(P0), PostgREST의 요청·인증 오류.
 * 나머지(네트워크, 앞단의 5xx, 연결 오류 08·57P·PGRST0)는 커밋됐는지 알 수 없다.
 */
const DEFINITE_REJECTION_CODE = /^(?:(?:22|23|42|P0)[0-9A-Z]{3}|PGRST[123]\d{2})$/;

/** 같은 키가 이미 있을 때. 다시 저장할 때는 앞선 시도와 같은 id를 쓰므로 앞선 시도가 저장했다는 뜻이다 */
const DUPLICATE_KEY_CODE = "23505";

/**
 * 서버가 처리했는지 알 수 없는 오류인지. 그렇다면 저장됐을 수 있다.
 *
 * @example if (isOutcomeUnknown(error)) setNotice("저장됐는지 확인하지 못했어요.")
 */
export const isOutcomeUnknown = (error: SaveErrorCode): boolean => !DEFINITE_REJECTION_CODE.test(error.code ?? "");

/**
 * 같은 키가 이미 있어 거절됐는지. 앞선 시도와 같은 id로 다시 만들 때 이 오류면 앞선 시도가 저장한 것이다.
 *
 * @example if (isDuplicateKey(error)) return updateTodo({ content, todoId: id })
 */
export const isDuplicateKey = (error: SaveErrorCode): boolean => error.code === DUPLICATE_KEY_CODE;

/**
 * 응답만 끊겼을 수 있어 한 번 더 보낸다. 다시 보내도 결과가 같은 요청(같은 id로 만들기, 같은 값으로 고치기)에만 쓴다.
 * `mayHaveApplied`면 첫 요청이 저장됐을 수 있어, 두 번째가 거절돼도 저장되지 않았다고 단정하면 안 된다.
 *
 * @example const { error, mayHaveApplied } = await callWithRetry(() => supabase.from("todos").insert({ id, content }))
 */
export const callWithRetry = async <Result extends { error: SaveErrorCode | null }>(
  call: () => PromiseLike<Result>,
): Promise<Result & { mayHaveApplied: boolean }> => {
  const first = await call();
  if (!first.error || !isOutcomeUnknown(first.error)) return { ...first, mayHaveApplied: false };
  return { ...(await call()), mayHaveApplied: true };
};

/**
 * 저장 결과. `gone`은 고칠 행이 그사이 지워졌다는 뜻, `conflict`는 화면을 연 뒤 다른 저장이 있어 거부됐다는 뜻,
 * `uncertain`은 서버에 저장됐을 수 있다는 뜻이다.
 */
export type SaveOutcome = "saved" | "gone" | "conflict" | "failed" | "uncertain";

/**
 * 거절된 요청의 결과. 처리했는지 모르거나 앞선 요청이 저장됐을 수 있으면 `uncertain`이다.
 *
 * @example const { error, mayHaveApplied } = await callWithRetry(call); if (error) return toRejectedOutcome(error, mayHaveApplied)
 */
export const toRejectedOutcome = (error: SaveErrorCode, mayHaveApplied: boolean): SaveOutcome =>
  mayHaveApplied || isOutcomeUnknown(error) ? "uncertain" : "failed";

/** 바뀐 행을 돌려받는 고치기 요청의 결과(`.update(...).select("id")`) */
interface UpdatedRows {
  data: unknown[] | null;
  error: SaveErrorCode | null;
}

interface UpdateRowWithRetryParams {
  /** 판 번호 조건(`revision in (불러온 판, 내 판)`)을 붙인 고치기 요청 */
  update: () => PromiseLike<UpdatedRows>;
  /** 바뀐 행이 없을 때 그 행이 아직 있는지 읽는 요청(`.select("id").eq("id", id).maybeSingle()`) */
  readRow: () => PromiseLike<{ data: unknown; error: SaveErrorCode | null }>;
}

/**
 * 행 하나를 고친다. 응답만 끊기면 한 번 더 보낸다(같은 값·같은 판 번호로 고치므로 결과가 같다).
 * 바뀐 행이 없으면 다시 읽어, 행이 있으면 화면을 연 뒤 바뀐 것(`conflict`), 없으면 지워진 것(`gone`)으로 본다.
 *
 * @example
 * const outcome = await updateRowWithRetry({
 *   update: () => todos.update({ content, revision }).eq("id", id).in("revision", [...expected, revision]).select("id"),
 *   readRow: () => todos.select("id").eq("id", id).maybeSingle(),
 * })
 */
export const updateRowWithRetry = async ({ update, readRow }: UpdateRowWithRetryParams): Promise<SaveOutcome> => {
  const { data, error, mayHaveApplied } = await callWithRetry(update);
  if (error) return toRejectedOutcome(error, mayHaveApplied);
  if (data && data.length > 0) return "saved";
  // 판 번호가 달라 거부됐는지, 고치는 사이 상대가 지웠는지는 둘 다 오류 없이 0행이라 다시 읽어 가린다
  const row = await readRow();
  if (row.error) return "failed";
  return row.data ? "conflict" : "gone";
};

interface CreateRowWithRetryParams extends UpdateRowWithRetryParams {
  /** 폼이 미리 정한 id로 만드는 요청. 다시 저장할 때도 같은 id를 쓴다 */
  insert: () => PromiseLike<{ error: SaveErrorCode | null }>;
}

/**
 * 폼이 미리 정한 id로 행을 만든다. 응답만 끊기면 한 번 더 보내고, 같은 id가 이미 있으면 앞선 시도가 저장한 것이라
 * 마지막에 누른 내용이 남도록 그 행을 이번 내용으로 고친다. 다시 저장해도 행이 둘이 되지 않는다.
 *
 * @example
 * const outcome = await createRowWithRetry({
 *   insert: () => todos.insert({ id, content, revision }),
 *   update: () => todos.update({ content, revision }).eq("id", id).in("revision", [...expected, revision]).select("id"),
 *   readRow: () => todos.select("id").eq("id", id).maybeSingle(),
 * })
 */
export const createRowWithRetry = async ({ insert, update, readRow }: CreateRowWithRetryParams): Promise<SaveOutcome> => {
  const { error, mayHaveApplied } = await callWithRetry(insert);
  if (!error) return "saved";
  if (!isDuplicateKey(error)) return toRejectedOutcome(error, mayHaveApplied);
  const outcome = await updateRowWithRetry({ update, readRow });
  // 앞선 시도가 만든 행은 있다. 그사이 상대가 고쳤으면 그 내용을 두고 저장된 것으로 본다(새 폼에는 불러올 최신 내용이 없다)
  if (outcome === "conflict") return "saved";
  // 고치기가 거절돼도 저장되지 않았다고 알리면 안 된다
  return outcome === "failed" ? "uncertain" : outcome;
};

/** 응답을 받지 못해 저장됐는지 모를 때의 문구. 같은 id·같은 값으로 다시 보내므로 다시 저장해도 된다 */
export const UNCERTAIN_SAVE_MESSAGE = "저장됐는지 확인하지 못했어요. 다시 저장해도 돼요.";

/** 저장 실패. 화면에 보여 줄 문구와, 고칠 대상이 이미 없는지, 화면을 연 뒤 바뀌었는지, 실패로 끝났지만 서버에 저장됐을 수 있는지 */
export interface SaveFailure {
  message: string;
  isGone: boolean;
  /** 다시 저장해도 거부되므로 최신 내용을 불러오게 한다 */
  hasConflict: boolean;
  mayHaveSaved: boolean;
}

/** 실패마다 보여 줄 문구. 저장됐는지 모를 때는 `UNCERTAIN_SAVE_MESSAGE`를 쓴다 */
interface SaveFailureMessages {
  failedMessage: string;
  goneMessage: string;
  conflictMessage: string;
}

const NO_FAILURE_FLAGS = { isGone: false, hasConflict: false, mayHaveSaved: false };

/**
 * 저장 결과를 폼이 보여 줄 실패로 바꾼다. 저장했으면 undefined.
 *
 * @example const failure = toSaveFailure(outcome, { failedMessage: "저장하지 못했어요.", goneMessage: "이미 지워졌어요.", conflictMessage: "그사이 바뀌었어요." })
 */
export const toSaveFailure = (outcome: SaveOutcome, { failedMessage, goneMessage, conflictMessage }: SaveFailureMessages): SaveFailure | undefined => {
  switch (outcome) {
    case "saved":
      return undefined;
    case "uncertain":
      return { ...NO_FAILURE_FLAGS, message: UNCERTAIN_SAVE_MESSAGE, mayHaveSaved: true };
    case "gone":
      return { ...NO_FAILURE_FLAGS, message: goneMessage, isGone: true };
    case "conflict":
      return { ...NO_FAILURE_FLAGS, message: conflictMessage, hasConflict: true };
    case "failed":
      return { ...NO_FAILURE_FLAGS, message: failedMessage };
  }
};

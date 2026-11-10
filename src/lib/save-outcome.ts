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


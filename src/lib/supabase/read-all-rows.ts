const DEFAULT_PAGE_SIZE = 1000;

interface ReadAllRowsParams<Row extends { id: string }> {
  /** id 순으로 `afterId`보다 큰 행을 최대 `limit`개 돌려준다. 처음에는 `afterId`가 undefined다 */
  fetchPage: (
    afterId: string | undefined,
    limit: number,
  ) => PromiseLike<{ data: Row[] | null; error: { message: string } | null }>;
  /**
   * 한 쪽을 읽지 못했을 때 던질 에러를 만든다. `cause`는 DB가 준 에러 그대로라 로그에 코드·상태가 남는다.
   * 조회 실패만 이 에러로 바뀌고, 그 밖의 에러는 그대로 올라간다
   */
  toError: (cause: unknown) => Error;
  pageSize?: number;
}

/**
 * id 순으로 빈 쪽이 올 때까지 읽어 합친다. Supabase는 한 번에 돌려주는 행 수에 상한(기본 1000, 설정으로 더 작게)이 있어,
 * 한 번에 읽으면 그보다 많은 목록이 안내 없이 잘린다(#160). 몇 번째부터가 아니라 마지막 id 다음부터 읽어,
 * 읽는 사이 앞쪽 행이 지워져도 건너뛰는 행이 없다. 화면에 필요한 순서는 다 읽은 뒤 따로 정렬한다.
 *
 * @throws {Error} 한 쪽이라도 읽지 못했을 때 `toError`가 만든 에러
 * @example
 * const todos = await readAllRows({
 *   fetchPage: (afterId, limit) => {
 *     const query = supabase.from("todos").select("id, content");
 *     return (afterId ? query.gt("id", afterId) : query).order("id").limit(limit);
 *   },
 *   toError: (cause) => new TodoLoadError({ cause }),
 * });
 */
export const readAllRows = async <Row extends { id: string }>({
  fetchPage,
  toError,
  pageSize = DEFAULT_PAGE_SIZE,
}: ReadAllRowsParams<Row>): Promise<Row[]> => {
  const rows: Row[] = [];
  let afterId: string | undefined;

  for (;;) {
    const { data, error } = await fetchPage(afterId, pageSize);
    if (error || !data) throw toError(error ?? new Error("응답에 행 목록이 없습니다"));
    if (data.length === 0) return rows;

    rows.push(...data);
    afterId = data[data.length - 1].id;
  }
};

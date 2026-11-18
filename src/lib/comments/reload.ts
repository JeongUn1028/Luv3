interface CreateLatestReloaderParams<T, A> {
  read: (request: A) => Promise<T>;
  /** 가장 나중에 보낸 요청의 결과만 받는다. 요청할 때 넘긴 값도 함께 받는다 */
  onLoaded: (value: T, request: A) => void;
  /** 가장 나중에 보낸 요청이 실패했을 때만 부른다 */
  onFailed: (error: unknown) => void;
}

/**
 * 다시 읽기를 여러 번 보내도 가장 나중에 보낸 요청의 결과만 쓰게 한다.
 * 댓글을 남긴 뒤 읽기와 지운 뒤 읽기가 겹쳐 늦게 온 옛 목록이 새 목록을 덮지 않게 한다(#355).
 *
 * @returns 다시 읽는 함수. 넘긴 값은 `read`와 `onLoaded`에 그대로 간다. 결과를 넘겨 주거나 버린 뒤 끝난다
 * @example const reload = createLatestReloader({ read, onLoaded: setComments, onFailed: console.error }); void reload(undefined);
 */
export const createLatestReloader = <T, A>({ read, onLoaded, onFailed }: CreateLatestReloaderParams<T, A>): ((request: A) => Promise<void>) => {
  let latest = 0;
  return async (request) => {
    latest += 1;
    const order = latest;
    try {
      const value = await read(request);
      if (order === latest) onLoaded(value, request);
    } catch (error) {
      if (order === latest) onFailed(error);
    }
  };
};

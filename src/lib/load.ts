/**
 * 화면 한 칸의 조회를 실행하고, 정해 둔 조회 에러만 던지지 않고 값으로 돌려준다.
 * 칸 하나를 못 불러와도 나머지 칸과 머리글·하단 탭은 그릴 수 있게 한다. 그 밖의 에러(로그인 이동 등)는 그대로 던진다.
 *
 * @example
 * const tiles = await catchLoadError(getAlbumTiles, AlbumLoadError)
 * if (tiles instanceof AlbumLoadError) return <p role="alert">{tiles.message}</p>
 */
export const catchLoadError = async <Result, LoadError extends Error>(
  load: () => Promise<Result>,
  errorClass: new (...args: never[]) => LoadError,
): Promise<Result | LoadError> => {
  try {
    return await load();
  } catch (error) {
    if (error instanceof errorClass) return error;
    throw error;
  }
};

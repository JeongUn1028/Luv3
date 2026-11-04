/**
 * 화면의 조회를 실행하고, 정해 둔 조회 에러만 던지지 않고 값으로 돌려준다.
 * 호출한 화면이 그 값으로 안내 문구를 그린다. 그 밖의 에러(로그인 이동 등)는 그대로 던진다.
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

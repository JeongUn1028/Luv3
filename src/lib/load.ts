import { isObject } from "@/lib/guards";

/**
 * 서버 로그에 남길 원인 항목. 운영에서 원인을 찾는 데 필요한 것만 고른다.
 * `details`·`hint`에는 행 값이나 내부 주소가 섞일 수 있어 그대로 남기지 않는다.
 */
const LOGGED_CAUSE_FIELDS = ["name", "code", "status", "message"] as const;

/** 응답이 JSON이 아니면 postgrest-js가 본문 전체를 `message`에 넣으므로 앞부분만 남긴다 */
const MAX_LOGGED_TEXT_LENGTH = 200;

/**
 * 연결 실패의 실제 원인. postgrest-js는 연결이 실패하면 `code`를 비우고 원인을 `details`의 "Caused by:" 줄에 넣는다.
 * `code`가 있으면 DB가 돌려준 `details`라 행 값이 섞일 수 있어 읽지 않는다.
 */
const readConnectionFailure = (cause: object): string | undefined => {
  const code: unknown = Reflect.get(cause, "code");
  const details: unknown = Reflect.get(cause, "details");
  if (code || typeof details !== "string") return undefined;
  return /^Caused by: (.+)$/m.exec(details)?.[1];
};

const toLoggedEntry = (key: string, value: unknown): [string, string | number][] => {
  if (typeof value === "number") return [[key, value]];
  return typeof value === "string" && value !== "" ? [[key, value.slice(0, MAX_LOGGED_TEXT_LENGTH)]] : [];
};

/**
 * 잡힌 오류의 원인에서 로그에 남겨도 되는 항목만 꺼낸다. Error의 name·message는 객체 펼치기로 옮겨지지 않아 하나씩 읽는다.
 *
 * @example console.error("장소 찾기 실패", toLoggedCause(error.cause))
 */
export const toLoggedCause = (cause: unknown): Record<string, string | number> => {
  if (!isObject(cause)) return {};

  return Object.fromEntries([
    ...LOGGED_CAUSE_FIELDS.flatMap((field) => toLoggedEntry(field, Reflect.get(cause, field))),
    ...toLoggedEntry("reason", readConnectionFailure(cause)),
  ]);
};

/**
 * 화면의 조회를 실행하고, 정해 둔 조회 에러만 던지지 않고 값으로 돌려준다.
 * 호출한 화면이 그 값으로 안내 문구를 그린다. 그 밖의 에러(로그인 이동 등)는 그대로 던진다.
 * `error.tsx`로 가지 않아 Next가 기록하지 않으므로, 잡은 에러의 원인은 여기서 서버 로그에 남긴다.
 *
 * @example
 * const firstPage = await catchLoadError(getAlbumFirstPage, AlbumLoadError)
 * if (firstPage instanceof AlbumLoadError) return <LoadErrorMessage message={firstPage.message} />
 */
export const catchLoadError = async <Result, LoadError extends Error>(
  load: () => Promise<Result>,
  errorClass: new (...args: never[]) => LoadError,
): Promise<Result | LoadError> => {
  try {
    return await load();
  } catch (error) {
    if (error instanceof errorClass) {
      console.error("조회 실패", error.name, toLoggedCause(error.cause));
      return error;
    }
    throw error;
  }
};

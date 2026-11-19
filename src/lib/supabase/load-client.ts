import type { createClient } from "./client";

type ClientModule = typeof import("./client");

// 한 번 받은 모듈을 다시 쓴다. 받지 못했으면(끊김, 배포로 예전 파일이 사라짐) 비워 다음에 다시 받는다
let clientModule: Promise<ClientModule> | undefined;

const importClientModule = (): Promise<ClientModule> => {
  clientModule ??= import("./client").catch((error: unknown) => {
    clientModule = undefined;
    throw error;
  });
  return clientModule;
};

/**
 * 브라우저용 Supabase 클라이언트를 쓰는 순간에 불러와 만든다.
 * 모든 화면의 공통 틀과 로그인 화면이 바로 불러오면 Supabase 라이브러리가 첫 묶음에 실려서다(#457).
 *
 * @throws 라이브러리 파일을 받지 못하면(끊김, 배포로 예전 파일이 사라짐)
 * @example const supabase = await loadClient();
 */
export const loadClient = async (): Promise<ReturnType<typeof createClient>> => (await importClientModule()).createClient();

interface WithLoadedClientParams<Result> {
  /** 불러온 클라이언트로 하는 요청. 여기서 던진 오류는 그대로 던진다 */
  request: (supabase: ReturnType<typeof createClient>) => Promise<Result>;
  /** 라이브러리 파일을 받지 못했을 때 돌려줄 값. 요청을 보내기 전이라 저장되지 않은 것이 분명하다 */
  onLoadFailed: () => Result;
}

/**
 * 클라이언트를 불러와 요청한다. 라이브러리 파일을 받지 못하면(끊김 등) 던지지 않고 기록만 남긴 뒤 `onLoadFailed`의 값을 돌려준다.
 * 요청 실패를 돌려받아 다루는 곳에서 던지면 저장 중에 멈추거나 오류 화면으로 넘어가서다(#486).
 *
 * @example const failure = await withLoadedClient({ request: (supabase) => saveTodo({ todos: supabase.from("todos"), ... }), onLoadFailed: () => TODO_NOT_SENT_FAILURE });
 */
export const withLoadedClient = async <Result>({ request, onLoadFailed }: WithLoadedClientParams<Result>): Promise<Result> => {
  let clientModuleLoaded: ClientModule;
  try {
    clientModuleLoaded = await importClientModule();
  } catch (error) {
    console.error(new Error("Supabase 라이브러리를 받지 못했습니다.", { cause: error }));
    return onLoadFailed();
  }
  // 받은 뒤 클라이언트를 만들다 난 오류(설정 값 등)는 받지 못한 것으로 숨기지 않고 던진다
  return request(clientModuleLoaded.createClient());
};

/**
 * 화면을 그린 뒤 라이브러리를 미리 받아 둔다. 세션이 끊긴 순간 같은 때 받느라 늦지 않고, 그사이 배포돼 예전 파일이 사라져도 이미 받아 둔 것을 쓴다.
 * 받지 못하면 기록만 남긴다. 쓸 때 `loadClient`가 다시 받는다.
 *
 * @example useEffect(() => preloadClient(), []);
 */
export const preloadClient = (): void => {
  importClientModule().catch((error: unknown) => console.error(new Error("Supabase 라이브러리를 미리 받지 못했습니다.", { cause: error })));
};

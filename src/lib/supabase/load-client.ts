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

/**
 * 화면을 그린 뒤 라이브러리를 미리 받아 둔다. 세션이 끊긴 순간 같은 때 받느라 늦지 않고, 그사이 배포돼 예전 파일이 사라져도 이미 받아 둔 것을 쓴다.
 * 받지 못하면 기록만 남긴다. 쓸 때 `loadClient`가 다시 받는다.
 *
 * @example useEffect(() => preloadClient(), []);
 */
export const preloadClient = (): void => {
  importClientModule().catch((error: unknown) => console.error(new Error("Supabase 라이브러리를 미리 받지 못했습니다.", { cause: error })));
};

import { execSync } from "node:child_process";

export interface LocalSupabase {
  url: string;
  publishableKey: string;
  serviceRoleKey: string;
}

const CACHE_KEY = "E2E_LOCAL_SUPABASE";

const parseStatus = (output: string): Map<string, string> =>
  new Map(
    output.split("\n").flatMap((line) => {
      const match = /^(\w+)="?(.*?)"?\s*$/.exec(line);
      return match?.[1] && match[2] !== undefined ? [[match[1], match[2]] as const] : [];
    }),
  );

const readRequired = (status: Map<string, string>, name: string): string => {
  const value = status.get(name);
  if (!value) throw new Error(`supabase status에 ${name}이 없습니다. pnpm db:start로 로컬 Supabase를 먼저 띄워 주세요.`);
  return value;
};

const readStatusOutput = (): string => {
  try {
    return execSync("pnpm exec supabase status -o env", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch (error) {
    throw new Error("로컬 Supabase 상태를 읽지 못했습니다. pnpm db:start로 먼저 띄워 주세요.", { cause: error });
  }
};

/**
 * 실행 중인 로컬 Supabase의 주소와 키를 읽는다. 테스트 데이터를 쓰고 지우므로 로컬 주소가 아니면 멈춘다.
 *
 * @example const { url, serviceRoleKey } = readLocalSupabase()
 */
export const readLocalSupabase = (): LocalSupabase => {
  // Playwright는 작업 프로세스마다 설정을 다시 읽는다. 환경 변수는 물려받으므로 명령을 한 번만 돌린다
  const cached = process.env[CACHE_KEY];
  if (cached) return JSON.parse(cached) as LocalSupabase;

  const status = parseStatus(readStatusOutput());
  const supabase: LocalSupabase = {
    url: readRequired(status, "API_URL"),
    publishableKey: readRequired(status, "PUBLISHABLE_KEY"),
    serviceRoleKey: readRequired(status, "SERVICE_ROLE_KEY"),
  };

  const { hostname } = new URL(supabase.url);
  if (hostname !== "127.0.0.1" && hostname !== "localhost") {
    throw new Error(`E2E는 로컬 Supabase에서만 실행합니다: ${hostname}`);
  }

  process.env[CACHE_KEY] = JSON.stringify(supabase);
  return supabase;
};

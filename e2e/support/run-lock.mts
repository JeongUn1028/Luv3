import { once } from "node:events";
import { connect, createServer, type Server } from "node:net";

/** 로컬 E2E 실행 잠금에 쓰는 포트. 앱 서버(3100) 바로 옆이다 */
export const RUN_LOCK_PORT = 3101;

const LOCK_HOST = "127.0.0.1";

/** 잠금을 잡은 실행. 다른 실행이 막혔을 때 어디서 돌고 있는지 알려 준다 */
export interface RunLockOwner {
  pid: number;
  cwd: string;
  startedAt: string;
}

/** 다른 로컬 E2E 실행이 돌고 있어 이 실행을 멈출 때 던진다 */
export class RunLockedError extends Error {
  constructor(port: number, owner: RunLockOwner | undefined) {
    super(
      [
        "다른 E2E 실행이 돌고 있어 멈춥니다. 로컬 Supabase와 앱 서버 포트를 함께 써서, 동시에 돌리면 서로의 전용 계정을 지웁니다.",
        owner
          ? `  돌고 있는 실행: 프로세스 ${owner.pid}, 폴더 ${owner.cwd}, 시작 ${owner.startedAt}`
          : `  ${port}번 포트를 다른 프로그램이 쓰고 있어 어떤 실행인지 읽지 못했습니다.`,
        "그 실행이 끝난 뒤 다시 돌려 주세요.",
      ].join("\n"),
    );
    this.name = "RunLockedError";
  }
}

interface AcquireRunLockParams {
  port: number;
  owner: RunLockOwner;
  /** 잠금을 잡은 실행의 정보를 기다리는 시간 */
  readTimeoutMs?: number;
}

const isRunLockOwner = (value: unknown): value is RunLockOwner =>
  typeof value === "object" &&
  value !== null &&
  "pid" in value &&
  typeof value.pid === "number" &&
  "cwd" in value &&
  typeof value.cwd === "string" &&
  "startedAt" in value &&
  typeof value.startedAt === "string";

const isNodeError = (error: unknown): error is NodeJS.ErrnoException => error instanceof Error && "code" in error;

/** 잠금을 잡은 실행에 접속해 정보를 받는다. 다른 프로그램이라 답이 없거나 형식이 다르면 `undefined`다 */
const readOwner = (port: number, timeoutMs: number): Promise<RunLockOwner | undefined> =>
  new Promise((resolve) => {
    const socket = connect(port, LOCK_HOST);
    let text = "";
    const finish = (): void => {
      socket.destroy();
      try {
        const value: unknown = JSON.parse(text);
        resolve(isRunLockOwner(value) ? value : undefined);
      } catch {
        resolve(undefined);
      }
    };
    socket.setEncoding("utf8");
    socket.setTimeout(timeoutMs, finish);
    socket.on("data", (chunk: string) => {
      text += chunk;
    });
    socket.on("end", finish);
    socket.on("error", finish);
  });

const listen = async (server: Server, port: number): Promise<boolean> => {
  server.listen(port, LOCK_HOST);
  try {
    await once(server, "listening");
    return true;
  } catch (error) {
    if (isNodeError(error) && error.code === "EADDRINUSE") return false;
    throw error;
  }
};

/**
 * 로컬 E2E 실행 잠금을 잡는다. 포트를 잡는 것이 잠금이라, 잡은 프로세스가 강제로 꺼져도 운영체제가 풀어 남는 것이 없다.
 * 접속해 오면 이 실행의 정보를 돌려주고, 이미 잡혀 있으면 그 정보를 담아 `RunLockedError`를 던진다.
 *
 * @example const release = await acquireRunLock({ port: RUN_LOCK_PORT, owner: { pid: process.pid, cwd: process.cwd(), startedAt: new Date().toISOString() } })
 */
export const acquireRunLock = async ({ port, owner, readTimeoutMs = 2000 }: AcquireRunLockParams): Promise<() => Promise<void>> => {
  const server = createServer((socket) => {
    socket.on("error", () => undefined);
    socket.end(JSON.stringify(owner));
  });
  if (!(await listen(server, port))) {
    const holder = await readOwner(port, readTimeoutMs);
    // 정보를 읽지 못했으면 그사이 잡은 실행이 끝났을 수 있어 한 번만 다시 잡아 본다
    if (holder || !(await listen(server, port))) throw new RunLockedError(port, holder);
  }

  return async () => {
    server.close();
    await once(server, "close");
  };
};

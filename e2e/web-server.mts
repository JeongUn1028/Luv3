import { spawn, spawnSync } from "node:child_process";
import { acquireRunLock, RUN_LOCK_PORT, RunLockedError } from "./support/run-lock.mts";

// Playwright의 webServer 명령. 앱을 빌드해 띄우기 전에 로컬 E2E 실행 잠금을 잡고, 앱 서버가 끝날 때까지 쥐고 있는다(#243).
// 앱 서버는 테스트를 실제로 돌릴 때만, 준비 단계(globalSetup)가 전용 계정을 지우기 전에 뜨고, 실행이 끝나면 Playwright가 끈다.

const port = process.argv[2];
if (!port) throw new Error("앱 서버 포트를 넘겨 주세요: node e2e/web-server.mts 3100");

try {
  // 풀기 함수는 쓰지 않는다. 앱이 도는 동안 잠금을 쥐고 있다가 이 프로세스가 끝날 때 운영체제가 풀게 한다
  await acquireRunLock({ port: RUN_LOCK_PORT, owner: { pid: process.pid, cwd: process.cwd(), startedAt: new Date().toISOString() } });
} catch (error) {
  if (!(error instanceof RunLockedError)) throw error;
  console.error(error.message);
  process.exit(1);
}

// Playwright가 끝날 때 이 프로세스의 묶음(맥·리눅스)이나 아래 프로세스 전체(Windows)를 끄므로, 앱도 같은 묶음에 둔다
const app = spawn(`pnpm build && pnpm start -p ${port}`, { shell: true, stdio: "inherit" });
app.on("exit", (code, signal) => process.exit(code ?? (signal ? 1 : 0)));

let isStopping = false;
/** 셸만 끄면 그 아래 빌드·앱 서버가 남아 앱 포트를 쥔 채 잠금만 풀리므로, 아래 프로세스까지 함께 끈다 */
const stopApp = (): void => {
  if (isStopping || app.pid === undefined) return;
  isStopping = true;
  if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(app.pid), "/T", "/F"]);
  // 0은 이 프로세스가 속한 묶음 전체다. 이 프로세스도 신호를 받지만 위에서 한 번만 처리하고, 앱이 끝나면 함께 끝난다
  else process.kill(0, "SIGTERM");
};
for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, stopApp);

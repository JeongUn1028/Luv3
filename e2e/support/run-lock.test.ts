import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { acquireRunLock, RunLockedError, type RunLockOwner } from "./run-lock.mts";

const OTHER_RUN: RunLockOwner = { pid: 4242, cwd: "C:/orca/workspaces/Luv3/other", startedAt: "2026-11-10T01:00:00.000Z" };
const THIS_RUN: RunLockOwner = { pid: 1111, cwd: "C:/orca/workspaces/Luv3/noddy", startedAt: "2026-11-10T02:00:00.000Z" };

/** 지금 비어 있는 포트 하나 */
const findFreePort = async (): Promise<number> => {
  const server = createServer().listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  server.close();
  await once(server, "close");
  if (typeof address !== "object" || address === null) throw new Error("포트를 얻지 못했습니다");
  return address.port;
};

describe("로컬 E2E 실행 잠금", () => {
  it("다른 실행이 없으면 잡고, 풀면 다음 실행이 다시 잡는다", async () => {
    // Arrange
    const port = await findFreePort();

    // Act
    const release = await acquireRunLock({ port, owner: THIS_RUN });
    await release();
    const acquiringAgain = acquireRunLock({ port, owner: OTHER_RUN });

    // Assert
    await expect(acquiringAgain).resolves.toBeTypeOf("function");
    await (await acquiringAgain)();
  });

  it("다른 실행이 잡고 있으면 그 실행의 폴더를 알려 주며 멈춘다", async () => {
    // Arrange
    const port = await findFreePort();
    const release = await acquireRunLock({ port, owner: OTHER_RUN });

    try {
      // Act
      const acquiring = acquireRunLock({ port, owner: THIS_RUN });

      // Assert
      await expect(acquiring).rejects.toThrow(RunLockedError);
      await expect(acquireRunLock({ port, owner: THIS_RUN })).rejects.toThrow(OTHER_RUN.cwd);
    } finally {
      await release();
    }
  });

  it("잠금을 잡은 프로세스가 강제로 꺼지면 남는 것 없이 다음 실행이 잡는다", async () => {
    // Arrange: 다른 실행이 잠금을 잡은 채 강제로 꺼진다
    const port = await findFreePort();
    const moduleUrl = pathToFileURL(join(import.meta.dirname, "run-lock.mts")).href;
    const holderScript = `const { acquireRunLock } = await import(${JSON.stringify(moduleUrl)});
await acquireRunLock({ port: ${port}, owner: ${JSON.stringify(OTHER_RUN)} });
console.log("ready");`;
    const holder = spawn(process.execPath, ["--input-type=module", "-e", holderScript]);
    await once(holder.stdout, "data");
    await expect(acquireRunLock({ port, owner: THIS_RUN })).rejects.toThrow(OTHER_RUN.cwd);
    holder.kill("SIGKILL");
    await once(holder, "exit");

    // Act
    const acquiring = acquireRunLock({ port, owner: THIS_RUN });

    // Assert
    await expect(acquiring).resolves.toBeTypeOf("function");
    await (await acquiring)();
  });

  it("잠금 포트를 다른 프로그램이 쓰고 있어 정보를 읽지 못해도 멈춘다", async () => {
    // Arrange: 접속을 받기만 하고 아무것도 보내지 않는다
    const port = await findFreePort();
    const other = createServer(() => undefined).listen(port, "127.0.0.1");
    await once(other, "listening");

    try {
      // Act & Assert
      await expect(acquireRunLock({ port, owner: THIS_RUN, readTimeoutMs: 200 })).rejects.toThrow(`${port}번 포트`);
    } finally {
      other.close();
      await once(other, "close");
    }
  });
});

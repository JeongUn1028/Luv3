import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const MIGRATION = "20261106050000_date_record_revision.sql";
const CHECKED_BODY = `## 운영 반영\n- [x] 머지 전에 \`pnpm exec supabase db push --linked\`로 \`${MIGRATION}\` 반영`;
const PAGE_SIZE = 100;

interface FakeGitHub {
  body?: string;
  files?: string[];
  status?: number;
}

let server: Server | undefined;

afterEach(() => {
  server?.close();
  server = undefined;
});

const startFakeGitHub = async ({ body, files = [], status = 200 }: FakeGitHub): Promise<string> => {
  const listen = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    response.statusCode = status;
    if (url.pathname.endsWith("/files")) {
      const page = Number(url.searchParams.get("page"));
      const pageSize = Number(url.searchParams.get("per_page"));
      const slice = files.slice((page - 1) * pageSize, page * pageSize);
      response.end(JSON.stringify(slice.map((filename) => ({ filename }))));
      return;
    }
    // 마지막으로 고친 본문을 읽는지 보기 위해 이벤트 파일과 다른 본문을 돌려준다
    response.end(JSON.stringify({ body: body ?? null }));
  });
  server = listen;
  await new Promise<void>((resolve) => listen.listen(0, "127.0.0.1", resolve));
  const { port } = listen.address() as AddressInfo;
  return `http://127.0.0.1:${port}`;
};

const runCheck = async (apiUrl: string): Promise<{ code: number | null; output: string }> => {
  const eventPath = path.join(mkdtempSync(path.join(tmpdir(), "db-apply-")), "event.json");
  writeFileSync(eventPath, JSON.stringify({ pull_request: { number: 7, body: "이벤트의 옛 본문" } }));

  const child = spawn(
    process.execPath,
    ["--disable-warning=MODULE_TYPELESS_PACKAGE_JSON", path.join(import.meta.dirname, "check.mts")],
    {
      env: {
        ...process.env,
        GITHUB_API_URL: apiUrl,
        GITHUB_EVENT_PATH: eventPath,
        GITHUB_REPOSITORY: "owner/repo",
        GITHUB_TOKEN: "test-token",
      },
    },
  );
  let output = "";
  child.stdout.on("data", (chunk) => (output += chunk));
  child.stderr.on("data", (chunk) => (output += chunk));
  const code = await new Promise<number | null>((resolve) => child.on("close", resolve));
  return { code, output };
};

// node를 새로 띄우므로 느린 환경에서 기본 5초를 넘길 수 있다. 이 테스트는 필수 검사에 들어가 우연한 실패가 머지를 막는다
describe("운영 DB 반영 확인 스크립트", { timeout: 30_000 }, () => {
  it("마이그레이션을 바꾸지 않은 PR은 본문이 없어도 통과한다", async () => {
    const apiUrl = await startFakeGitHub({ files: ["README.md"] });

    expect((await runCheck(apiUrl)).code).toBe(0);
  });

  it("마이그레이션을 바꾸고 체크하지 않으면 실패하고 넣을 줄을 알려 준다", async () => {
    const apiUrl = await startFakeGitHub({ files: [`supabase/migrations/${MIGRATION}`] });

    const { code, output } = await runCheck(apiUrl);

    expect(code).toBe(1);
    expect(output).toContain(`- [ ] 머지 전에 \`pnpm exec supabase db push --linked\`로 \`${MIGRATION}\` 반영`);
  });

  it("마이그레이션을 바꾸고 체크했으면 통과한다", async () => {
    const apiUrl = await startFakeGitHub({ body: CHECKED_BODY, files: [`supabase/migrations/${MIGRATION}`] });

    expect((await runCheck(apiUrl)).code).toBe(0);
  });

  it("마이그레이션이 다음 쪽에 있어도 찾아낸다", async () => {
    const others = Array.from({ length: PAGE_SIZE }, (_, index) => `src/file-${index}.ts`);
    const apiUrl = await startFakeGitHub({ files: [...others, `supabase/migrations/${MIGRATION}`] });

    expect((await runCheck(apiUrl)).code).toBe(1);
  });

  it("GitHub에서 읽지 못하면 통과시키지 않는다", async () => {
    const apiUrl = await startFakeGitHub({ status: 500 });

    const { code, output } = await runCheck(apiUrl);

    expect(code).toBe(1);
    expect(output).toContain("다시 실행");
    expect(output).not.toContain("at ");
  });
});

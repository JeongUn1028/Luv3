import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

/** main 보호의 필수 상태 검사로 등록한 E2E 잡 이름(README "필수 상태 검사", #189) */
const REQUIRED_E2E_CHECK = "test:e2e";
/** 잡 시간 제한의 상한. 기본값(6시간)이나 그에 가까운 값으로 되돌리면 실패하게 한다 */
const MAX_JOB_MINUTES = 30;
const SHARD_ARGUMENT = "--shard=${{ matrix.shardIndex }}/${{ matrix.shardTotal }}";

interface WorkflowStep {
  run?: string;
  env?: Record<string, string>;
}

interface WorkflowJob {
  name?: string;
  needs?: string | string[];
  if?: string;
  "timeout-minutes"?: number;
  uses?: string;
  strategy?: { "fail-fast"?: boolean; matrix?: Record<string, unknown> };
  steps?: WorkflowStep[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isNumberList = (value: unknown): value is number[] =>
  Array.isArray(value) && value.every((item) => typeof item === "number");

const WORKFLOW_DIR = join(import.meta.dirname, "..", "..", ".github", "workflows");

const readJobs = (fileName: string): Record<string, WorkflowJob> => {
  const workflow: unknown = parse(readFileSync(join(WORKFLOW_DIR, fileName), "utf8"));
  if (!isRecord(workflow) || !isRecord(workflow.jobs)) throw new Error(`${fileName}에 jobs가 없습니다`);
  // 잡의 세부 칸은 아래 단언이 하나씩 확인한다
  return workflow.jobs as Record<string, WorkflowJob>;
};

const jobs = readJobs("ci.yml");

const toList = (value: string | string[] | undefined): string[] => (value === undefined ? [] : [value].flat());

/** E2E를 나눠 돌리는 잡. `pnpm test:e2e --shard=`를 실행하는 잡이다 */
const shardJobIds = Object.keys(jobs).filter((id) =>
  (jobs[id].steps ?? []).some((step) => step.run?.includes("pnpm test:e2e --shard=")),
);

const finalJobIds = Object.keys(jobs).filter((id) => jobs[id].name === REQUIRED_E2E_CHECK);

describe("CI의 E2E 나눠 돌리기", () => {
  it("E2E를 나눠 돌리면 필수 검사 이름의 마무리 잡 하나가 나눈 잡을 모두 기다린다", () => {
    // 나눈 잡은 이름이 `test:e2e (1/3)`처럼 바뀌어, 같은 이름의 마무리 잡이 없으면 필수 검사가 영영 기다린다(#238)
    expect(shardJobIds.length).toBeGreaterThan(0);
    expect(finalJobIds).toHaveLength(1);
    const [finalJobId] = finalJobIds;
    expect(shardJobIds).not.toContain(finalJobId);
    expect(toList(jobs[finalJobId].needs)).toEqual(expect.arrayContaining(shardJobIds));
  });

  it("나눈 잡이 실패하거나 취소되면 마무리 잡은 건너뛰지 않고 실패로 끝난다", () => {
    // 건너뛴 잡은 필수 검사에서 통과로 쳐져, 마무리 잡이 건너뛰거나 늘 성공하면 E2E가 실패한 PR도 머지된다
    const [finalJobId] = finalJobIds;
    const finalJob = jobs[finalJobId];
    expect(finalJob.if).toMatch(/\balways\(\)/);

    for (const shardJobId of shardJobIds) {
      const checksResult = (finalJob.steps ?? []).some((step) => {
        const resultVariable = Object.entries(step.env ?? {}).find(
          ([, value]) => value.replaceAll(" ", "") === `\${{needs.${shardJobId}.result}}`,
        )?.[0];
        const lines = (step.run ?? "").split("\n").map((line) => line.trim());
        return (
          resultVariable !== undefined &&
          lines.includes(`test "$${resultVariable}" = success`) &&
          !lines.some((line) => line.includes("||") || line.startsWith("set +e"))
        );
      });
      expect(checksResult).toBe(true);
    }
  });

  it("대 수를 정하면 나눈 잡은 1번부터 마지막 번호까지 모두 matrix 값으로 돌리고 한 대가 실패해도 나머지를 끝까지 돌린다", () => {
    // 번호를 빠뜨리거나 실행 줄에 번호를 고정하면 일부 테스트가 어느 대에서도 돌지 않고 검사는 통과한다
    for (const id of shardJobIds) {
      const { strategy, steps } = jobs[id];
      const matrix = strategy?.matrix ?? {};
      const { shardIndex, shardTotal } = matrix;

      expect(strategy?.["fail-fast"]).toBe(false);
      expect(isNumberList(shardTotal) && isNumberList(shardIndex)).toBe(true);
      if (!isNumberList(shardTotal) || !isNumberList(shardIndex)) continue;
      expect(shardTotal).toHaveLength(1);
      expect(shardIndex).toEqual(Array.from({ length: shardTotal[0] }, (_, index) => index + 1));
      expect((steps ?? []).some((step) => step.run?.includes(SHARD_ARGUMENT))).toBe(true);
    }
  });
});

describe("워크플로 잡의 시간 제한", () => {
  it("잡이 멈추면 정해 둔 시간 안에 끝난다", () => {
    // 시간 제한이 없으면 멈춘 잡이 기본 6시간 동안 러너를 잡고 필수 검사도 그동안 기다린다(#241)
    const unlimited = readdirSync(WORKFLOW_DIR)
      .filter((fileName) => /\.ya?ml$/.test(fileName))
      .flatMap((fileName) =>
        Object.entries(readJobs(fileName))
          // 다른 워크플로를 불러 쓰는 잡은 timeout-minutes를 받지 않는다(불려 간 워크플로의 잡이 제한을 둔다)
          .filter(([, job]) => job.uses === undefined)
          .filter(([, job]) => {
            const minutes = job["timeout-minutes"];
            return typeof minutes !== "number" || minutes <= 0 || minutes > MAX_JOB_MINUTES;
          })
          .map(([id]) => `${fileName}: ${id}`),
      );

    expect(unlimited).toEqual([]);
  });
});

describe("CI의 커버리지", () => {
  it("단위 테스트는 커버리지를 재는 명령으로 돌려 바닥값 아래면 실패한다", () => {
    // pnpm test로 돌리면 커버리지를 재지 않아 바닥값이 있어도 CI가 확인하지 않는다(#256)
    const runs = Object.values(jobs).flatMap(({ steps = [] }) => steps.map((step) => step.run?.trim()));

    expect(runs).toContain("pnpm test:coverage");
    expect(runs).not.toContain("pnpm test");
  });
});

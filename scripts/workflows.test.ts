import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { isObject } from "@/lib/guards";

// GitHub Actions 워크플로 공통 규칙(#359)
const WORKFLOW_DIR = ".github/workflows";
const WORKFLOW_FILES = readdirSync(WORKFLOW_DIR).filter((name) => name.endsWith(".yml"));

/** Node 24로 도는 첫 판. 그 앞 판은 Node 20용이라 GitHub가 경고를 남기고 Node 24로 억지로 돌린다(2025-09-19 지원 종료 공지) */
const NODE24_MAJOR: Record<string, number> = {
  "actions/checkout": 5,
  "actions/setup-node": 5,
  "pnpm/action-setup": 5,
  "actions/upload-artifact": 6,
};

interface Step {
  uses?: string;
  run?: string;
  with?: Record<string, unknown>;
}

const readWorkflow = (name: string): Record<string, unknown> => {
  const workflow: unknown = parse(readFileSync(join(WORKFLOW_DIR, name), "utf8"));
  if (!isObject(workflow)) throw new Error(`${name}을 읽지 못했습니다`);
  return workflow;
};

const readJobs = (name: string): Record<string, unknown>[] => {
  const { jobs } = readWorkflow(name);
  return isObject(jobs) ? Object.values(jobs).filter(isObject) : [];
};

const readSteps = (job: Record<string, unknown>): Step[] => (Array.isArray(job.steps) ? job.steps.filter(isObject) : []);

const allSteps = WORKFLOW_FILES.flatMap((name) => readJobs(name).flatMap((job) => readSteps(job).map((step) => ({ name, step }))));

describe("워크플로", () => {
  it("공식 액션은 Node 24로 도는 판 이상을 쓴다", () => {
    // Arrange
    const old = allSteps.flatMap(({ name, step }) => {
      const [action, version = ""] = (step.uses ?? "").split("@");
      const minimum = action === undefined ? undefined : NODE24_MAJOR[action];
      const major = Number(/^v(\d+)/.exec(version)?.[1]);
      return minimum !== undefined && !(major >= minimum) ? [`${name}: ${step.uses}`] : [];
    });

    // Act & Assert
    expect(old).toEqual([]);
  });

  it("모든 워크플로가 토큰 권한을 적어 둔다", () => {
    // Act & Assert
    expect(WORKFLOW_FILES.filter((name) => !("permissions" in readWorkflow(name)))).toEqual([]);
  });

  it("CI는 저장소를 읽기만 한다", () => {
    // Act & Assert
    expect(readWorkflow("ci.yml").permissions).toEqual({ contents: "read" });
  });

  // 운영 주소가 바뀌면 한곳(저장소 변수 PRODUCTION_URL)만 고친다
  it("운영 주소를 파일에 적지 않고 저장소 변수로 읽는다", () => {
    // Arrange
    const sources = WORKFLOW_FILES.map((name) => ({ name, source: readFileSync(join(WORKFLOW_DIR, name), "utf8") }));

    // Act & Assert
    expect(sources.filter(({ source }) => source.includes("luv3.vercel.app")).map(({ name }) => name)).toEqual([]);
    expect(sources.filter(({ source }) => source.includes("vars.PRODUCTION_URL")).map(({ name }) => name).sort()).toEqual([
      "keep-warm.yml",
      "keepalive.yml",
      "storage-check.yml",
    ]);
  });

  it("운영 주소를 쓰는 워크플로는 부르기 전에 주소 모양(https, 끝에 / 없음)을 확인한다", () => {
    // Arrange
    const unchecked = ["keep-warm.yml", "keepalive.yml", "storage-check.yml"].filter(
      (name) => !readFileSync(join(WORKFLOW_DIR, name), "utf8").includes('[[ "$PRODUCTION_URL" =~ ^https://[^/]+$ ]]'),
    );

    // Act & Assert
    expect(unchecked).toEqual([]);
  });
});

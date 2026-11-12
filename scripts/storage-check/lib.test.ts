import { describe, expect, it } from "vitest";
import { evaluateCleanupPreview, toWorkflowCommand } from "./lib.mts";

const MEGABYTE = 1024 ** 2;

const previewBody = (overrides: Record<string, unknown> = {}): string =>
  JSON.stringify({
    status: "preview",
    orphanPaths: [],
    recentOrphanCount: 0,
    unknownPaths: [],
    inUseCount: 120,
    staleOrphanCount: 0,
    fileCount: 120,
    totalBytes: 100 * MEGABYTE,
    unsizedCount: 0,
    trashFileCount: 0,
    trashBytes: 0,
    expiredTrashCount: 0,
    overdueTrashCount: 0,
    ...overrides,
  });

describe("evaluateCleanupPreview", () => {
  it("사용량이 80% 아래이고 지울 파일·멈춘 이유가 없으면 문제 없이 사용량만 요약한다", () => {
    const result = evaluateCleanupPreview({ httpStatus: 200, body: previewBody() });

    expect(result.problems).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.summary).toContain("사진 파일 120개, 100.0 MB (무료 저장 용량 1GB의 9.8%)");
  });

  it("사용량이 1GB의 80%에 닿으면 문제로 알리고, 그보다 1바이트 적으면 알리지 않는다", () => {
    const limitBytes = Math.ceil(0.8 * 1024 ** 3);

    const atLimit = evaluateCleanupPreview({ httpStatus: 200, body: previewBody({ totalBytes: limitBytes }) });
    const belowLimit = evaluateCleanupPreview({ httpStatus: 200, body: previewBody({ totalBytes: limitBytes - 1 }) });

    expect(atLimit.problems).toEqual([expect.stringContaining("1GB의 80.0%")]);
    expect(belowLimit.problems).toEqual([]);
  });

  it("정리 작업이 멈출 이유(reason)가 있으면 그 이유를 문제로 알린다", () => {
    const result = evaluateCleanupPreview({ httpStatus: 200, body: previewBody({ reason: "지울 파일이 101개로 …" }) });

    expect(result.problems).toEqual([expect.stringContaining("지울 파일이 101개로 …")]);
  });

  it("지난 1일 정리가 지웠어야 할 파일이 남아 있으면 공개 실행 기록에 경로는 빼고 개수만 문제로 알린다", () => {
    const orphanPaths = Array.from({ length: 7 }, (_, index) => `d/${index}.jpg`);

    const result = evaluateCleanupPreview({ httpStatus: 200, body: previewBody({ orphanPaths, staleOrphanCount: 3 }) });

    expect(result.problems).toEqual([expect.stringContaining("지난 1일 정리가 지웠어야 할 파일 3개")]);
    expect(result.problems[0]).not.toContain("d/0.jpg");
  });

  it("지울 파일이 지난 정리 뒤에 생긴 것뿐이면 문제로 보지 않는다", () => {
    // GitHub 예약 실행이 늦거나 점검을 손으로 돌리면, 정리 때 하루가 안 됐던 파일이 점검 때는 하루를 넘는다
    const result = evaluateCleanupPreview({ httpStatus: 200, body: previewBody({ orphanPaths: ["d/0.jpg"], staleOrphanCount: 0 }) });

    expect(result.problems).toEqual([]);
    expect(result.summary.join(" ")).toContain("지울 파일 1개(지난 정리가 지웠어야 할 것 0개)");
  });

  it("휴지통 파일 수·크기를 요약에 담는다(전체 사용량에 이미 들어 있다)", () => {
    const result = evaluateCleanupPreview({
      httpStatus: 200,
      body: previewBody({ trashFileCount: 6, trashBytes: 3 * MEGABYTE, expiredTrashCount: 1 }),
    });

    expect(result.problems).toEqual([]);
    expect(result.summary).toContain("휴지통 파일 6개, 3.0 MB (보관 기간이 지나 이번 정리에서 지울 사진 1장)");
  });

  it("지난 1일 정리가 지웠어야 할 휴지통 사진이 남아 있으면 문제로 알린다", () => {
    const result = evaluateCleanupPreview({ httpStatus: 200, body: previewBody({ expiredTrashCount: 2, overdueTrashCount: 2 }) });

    expect(result.problems).toEqual([expect.stringContaining("지난 1일 정리가 지웠어야 할 휴지통 사진 2장")]);
  });

  it("이름 규칙에 없는 파일과 크기를 모르는 파일은 실패로 끝내지 않고 경고만 한다", () => {
    const result = evaluateCleanupPreview({
      httpStatus: 200,
      body: previewBody({ unknownPaths: ["misc/note.txt"], unsizedCount: 2 }),
    });

    expect(result.problems).toEqual([]);
    expect(result.warnings).toHaveLength(2);
    expect(result.warnings).toEqual(
      expect.arrayContaining([expect.stringContaining("이름이 아닌 파일 1개"), expect.stringContaining("크기를 주지 않은 파일 2개")]),
    );
    expect(result.warnings.join(" ")).not.toContain("misc/note.txt");
  });

  it.each([
    [401, '{"code":"UNAUTHORIZED","message":"허락되지 않은 요청입니다."}', "CRON_SECRET"],
    [500, '{"code":"CLEANUP_NOT_CONFIGURED","message":"사진 정리 설정이 없습니다."}', "SUPABASE_SECRET_KEY"],
    [500, "Internal Server Error", "Vercel 로그"],
    [502, '{"code":"CLEANUP_FAILED","message":"사진을 정리하지 못했습니다."}', "일시정지"],
    [504, "An error occurred with your deployment", "시간"],
  ])("HTTP %i(%s)면 원인 안내와 함께 문제로 알린다", (httpStatus, body, hint) => {
    const result = evaluateCleanupPreview({ httpStatus, body });

    expect(result.problems).toEqual([expect.stringContaining(hint)]);
    expect(result.problems[0]).toContain(`HTTP ${httpStatus}`);
  });

  it("실패 응답이 정리 결과(409 등)면 경로가 공개 실행 기록에 남지 않게 본문을 옮기지 않는다", () => {
    const body = JSON.stringify({ orphanPaths: ["secret/a.jpg"], status: "blocked", reason: "많음" });

    const result = evaluateCleanupPreview({ httpStatus: 409, body });

    expect(result.problems).toHaveLength(1);
    expect(result.problems[0]).not.toContain("secret/a.jpg");
  });

  it("응답 본문이 비어 있어도 문제로 알린다", () => {
    expect(evaluateCleanupPreview({ httpStatus: 200, body: "" }).problems).toEqual([expect.stringContaining("JSON")]);
  });

  it("응답이 JSON이 아니면 문제로 알린다", () => {
    const result = evaluateCleanupPreview({ httpStatus: 200, body: "<html>" });

    expect(result.problems).toEqual([expect.stringContaining("JSON")]);
  });

  it("미리 보기가 아닌 응답이면 문제로 알린다", () => {
    const result = evaluateCleanupPreview({ httpStatus: 200, body: previewBody({ status: "deleted" }) });

    expect(result.problems).toEqual([expect.stringContaining("미리 보기")]);
  });

  it.each(["totalBytes", "staleOrphanCount", "inUseCount", "orphanPaths", "trashBytes", "overdueTrashCount"])(
    "응답에 %s가 없으면(예전 배포 등) 문제로 알린다",
    (field) => {
      const result = evaluateCleanupPreview({ httpStatus: 200, body: previewBody({ [field]: undefined }) });

      expect(result.problems).toEqual([expect.stringContaining(field)]);
    },
  );
});

describe("toWorkflowCommand", () => {
  it("GitHub Actions 명령 줄로 바꾸고 %와 줄바꿈을 이스케이프한다", () => {
    expect(toWorkflowCommand("error", "1GB의 80%\n다음 줄")).toBe("::error::1GB의 80%25%0A다음 줄");
  });
});

import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { catchLoadError } from "./load";

class SampleLoadError extends Error {}

describe("catchLoadError", () => {
  let logError: MockInstance<typeof console.error>;

  beforeEach(() => {
    logError = vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    logError.mockRestore();
  });

  it("조회가 성공하면 결과를 그대로 돌려주고 로그를 남기지 않는다", async () => {
    await expect(catchLoadError(async () => ["사진"], SampleLoadError)).resolves.toEqual(["사진"]);

    expect(logError).not.toHaveBeenCalled();
  });

  it("정해 둔 조회 에러는 던지지 않고 값으로 돌려준다", async () => {
    // Arrange
    const error = new SampleLoadError("못 불러왔어요");

    // Act
    const result = await catchLoadError(async () => Promise.reject(error), SampleLoadError);

    // Assert
    expect(result).toBe(error);
  });

  it("그 밖의 에러(로그인 이동 등)는 그대로 던지고 로그를 남기지 않는다", async () => {
    const other = new Error("NEXT_REDIRECT");

    await expect(catchLoadError(async () => Promise.reject(other), SampleLoadError)).rejects.toBe(other);

    expect(logError).not.toHaveBeenCalled();
  });

  it("잡은 조회 에러의 원인을 서버 로그에 남긴다", async () => {
    // Arrange
    const cause = { name: "PostgrestError", code: "42501", status: 403, message: "permission denied for table todos" };
    const error = new SampleLoadError("못 불러왔어요", { cause });
    error.name = "SampleLoadError";

    // Act
    await catchLoadError(async () => Promise.reject(error), SampleLoadError);

    // Assert
    expect(logError).toHaveBeenCalledExactlyOnceWith("조회 실패", "SampleLoadError", cause);
  });

  it("행 값이나 내부 정보가 섞일 수 있는 항목은 로그에 남기지 않는다", async () => {
    // Arrange
    const cause = {
      code: "42501",
      message: "permission denied",
      details: "Failing row contains (비밀 메모)",
      hint: "내부 안내",
      stack: "at 내부 경로",
      nested: { token: "비밀 토큰" },
    };

    // Act
    await catchLoadError(async () => Promise.reject(new SampleLoadError("못 불러왔어요", { cause })), SampleLoadError);

    // Assert
    const logged = JSON.stringify(logError.mock.calls);
    expect(logged).toContain("permission denied");
    for (const secret of ["비밀 메모", "내부 안내", "내부 경로", "비밀 토큰"]) {
      expect(logged).not.toContain(secret);
    }
  });

  it("Error 객체가 원인이면 이름과 메시지를 남긴다", async () => {
    // Arrange: Error의 name·message는 JSON으로 옮겨지지 않아 직접 읽어야 한다
    const cause = new TypeError("fetch failed");

    // Act
    await catchLoadError(async () => Promise.reject(new SampleLoadError("못 불러왔어요", { cause })), SampleLoadError);

    // Assert
    expect(logError.mock.calls[0]?.[2]).toEqual({ name: "TypeError", message: "fetch failed" });
  });

  it("연결 실패면 details에서 실제 원인 줄만 남긴다", async () => {
    // Arrange: postgrest-js는 연결 실패 때 code를 비우고 원인을 details에 넣는다
    const cause = {
      code: "",
      message: "TypeError: fetch failed",
      details: "TypeError: fetch failed\n\nCaused by: Error: getaddrinfo ENOTFOUND db.example.co (ENOTFOUND)\n    at 내부 경로",
    };

    // Act
    await catchLoadError(async () => Promise.reject(new SampleLoadError("못 불러왔어요", { cause })), SampleLoadError);

    // Assert
    expect(logError.mock.calls[0]?.[2]).toEqual({
      message: "TypeError: fetch failed",
      reason: "Error: getaddrinfo ENOTFOUND db.example.co (ENOTFOUND)",
    });
  });

  it("DB가 돌려준 오류의 details는 원인 줄처럼 보여도 남기지 않는다", async () => {
    // Arrange
    const cause = { code: "23505", message: "duplicate key", details: "Caused by: 비밀 메모" };

    // Act
    await catchLoadError(async () => Promise.reject(new SampleLoadError("못 불러왔어요", { cause })), SampleLoadError);

    // Assert
    expect(JSON.stringify(logError.mock.calls)).not.toContain("비밀 메모");
  });

  it("응답 본문이 통째로 들어온 긴 메시지는 앞부분만 남긴다", async () => {
    // Arrange: 게이트웨이가 HTML로 답하면 postgrest-js는 본문 전체를 message에 넣는다
    const cause = { message: `<html>${"가".repeat(5000)}비밀 주소</html>` };

    // Act
    await catchLoadError(async () => Promise.reject(new SampleLoadError("못 불러왔어요", { cause })), SampleLoadError);

    // Assert
    const logged = logError.mock.calls[0]?.[2] as { message: string };
    expect(logged.message.length).toBeLessThanOrEqual(200);
    expect(logged.message).not.toContain("비밀 주소");
  });

  it("원인이 없거나 객체가 아니어도 조회 에러는 값으로 돌려준다", async () => {
    // Arrange
    const withoutCause = new SampleLoadError("못 불러왔어요");
    const textCause = new SampleLoadError("못 불러왔어요", { cause: "비밀 문자열" });

    // Act
    const results = [
      await catchLoadError(async () => Promise.reject(withoutCause), SampleLoadError),
      await catchLoadError(async () => Promise.reject(textCause), SampleLoadError),
    ];

    // Assert
    expect(results).toEqual([withoutCause, textCause]);
    expect(JSON.stringify(logError.mock.calls)).not.toContain("비밀 문자열");
  });
});

import { describe, expect, it } from "vitest";
import { catchLoadError } from "./load";

class SampleLoadError extends Error {}

describe("catchLoadError", () => {
  it("조회가 성공하면 결과를 그대로 돌려준다", async () => {
    await expect(catchLoadError(async () => ["사진"], SampleLoadError)).resolves.toEqual(["사진"]);
  });

  it("정해 둔 조회 에러는 던지지 않고 값으로 돌려준다", async () => {
    // Arrange
    const error = new SampleLoadError("못 불러왔어요");

    // Act
    const result = await catchLoadError(async () => Promise.reject(error), SampleLoadError);

    // Assert
    expect(result).toBe(error);
  });

  it("그 밖의 에러(로그인 이동 등)는 그대로 던진다", async () => {
    const other = new Error("NEXT_REDIRECT");

    await expect(catchLoadError(async () => Promise.reject(other), SampleLoadError)).rejects.toBe(other);
  });
});

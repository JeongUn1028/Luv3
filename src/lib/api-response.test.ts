import { describe, expect, it } from "vitest";
import { toErrorResponse } from "./api-response";

describe("toErrorResponse", () => {
  it("코드·안내를 상태 코드와 함께 돌려주고 응답을 저장해 두지 않게 한다", async () => {
    // Act
    const response = toErrorResponse("INVALID_QUERY", "찾을 내용을 다시 적어 주세요.", 400);

    // Assert
    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({ code: "INVALID_QUERY", message: "찾을 내용을 다시 적어 주세요." });
  });
});

import { describe, expect, it, vi } from "vitest";
import { DeleteDateRecordError, deleteDateRecord } from "./delete";

const RECORD_ID = "10000000-0000-4000-8000-000000000001";

describe("deleteDateRecord", () => {
  it("기록 행만 지우고 사진 파일은 지우지 않는다(DB가 휴지통에 남기고 정리 작업이 30일 뒤 지운다)", async () => {
    const deleteRecord = vi.fn(async () => ({ error: null }));

    await deleteDateRecord({ recordId: RECORD_ID, deleteRecord });

    expect(deleteRecord).toHaveBeenCalledWith(RECORD_ID);
  });

  it("행을 지우지 못하면 다시 시도하라고 알린다", async () => {
    const deleteRecord = vi.fn(async () => ({ error: { message: "rls" } }));

    const result = deleteDateRecord({ recordId: RECORD_ID, deleteRecord });

    await expect(result).rejects.toThrow(DeleteDateRecordError);
    await expect(result).rejects.toThrow("기록을 지우지 못했어요");
  });
});

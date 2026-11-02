import { describe, expect, it, vi } from "vitest";
import type { PhotoStorage } from "@/lib/photos/upload";
import { DeleteDateRecordError, deleteDateRecord } from "./delete";

const RECORD_ID = "10000000-0000-4000-8000-000000000001";
const FILE_PATHS = [`${RECORD_ID}/a.jpg`, `${RECORD_ID}/a_thumb.jpg`];

const createStorage = (error: { message: string } | null = null) => {
  const calls: string[] = [];
  const storage: Pick<PhotoStorage, "remove"> = {
    remove: vi.fn(async () => {
      calls.push("storage");
      return { error };
    }),
  };
  return { storage, calls };
};

describe("deleteDateRecord", () => {
  it("사진 파일을 먼저 지운 뒤 기록 행을 지운다", async () => {
    const { storage, calls } = createStorage();
    const deleteRecord = vi.fn(async () => {
      calls.push("row");
      return { error: null };
    });

    await deleteDateRecord({ recordId: RECORD_ID, filePaths: FILE_PATHS, storage, deleteRecord });

    expect(storage.remove).toHaveBeenCalledWith(FILE_PATHS);
    expect(deleteRecord).toHaveBeenCalledWith(RECORD_ID);
    expect(calls).toEqual(["storage", "row"]);
  });

  it("파일을 지우지 못하면 행은 그대로 두고 다시 시도하라고 알린다", async () => {
    const { storage } = createStorage({ message: "network" });
    const deleteRecord = vi.fn(async () => ({ error: null }));

    await expect(
      deleteDateRecord({ recordId: RECORD_ID, filePaths: FILE_PATHS, storage, deleteRecord }),
    ).rejects.toThrow(DeleteDateRecordError);
    expect(deleteRecord).not.toHaveBeenCalled();
  });

  it("행을 지우지 못하면 다시 시도하라고 알린다(파일 삭제는 다시 해도 안전하다)", async () => {
    const { storage } = createStorage();
    const deleteRecord = vi.fn(async () => ({ error: { message: "rls" } }));

    await expect(
      deleteDateRecord({ recordId: RECORD_ID, filePaths: FILE_PATHS, storage, deleteRecord }),
    ).rejects.toThrow("기록을 지우지 못했어요");
  });
});

import { describe, expect, it } from "vitest";
import type { SaveFailure } from "@/lib/save-outcome";
import { toFailedRecordFields, toRecordFormEnding } from "./record-form-outcome";

const failure = (flags: Partial<Omit<SaveFailure, "message">> = {}): SaveFailure => ({
  message: "저장하지 못했어요.",
  isGone: false,
  hasConflict: false,
  mayHaveSaved: false,
  ...flags,
});

describe("toFailedRecordFields", () => {
  it("저장됐을 수 있으면 이번 기록 id와 이번 판 번호를 기억한다", () => {
    const fields = toFailedRecordFields({
      failure: failure({ mayHaveSaved: true }),
      draft: { expectedRevisions: ["rev-1"], nextRevision: "rev-2", uncertainSaveRecordId: undefined },
      recordId: "r1",
    });

    expect(fields).toEqual({ hasConflict: false, expectedRevisions: ["rev-1", "rev-2"], uncertainSaveRecordId: "r1" });
  });

  it("저장되지 않은 게 분명하면 앞서 기억한 기록 id와 판 번호를 그대로 둔다", () => {
    const fields = toFailedRecordFields({
      failure: failure(),
      draft: { expectedRevisions: ["rev-1"], nextRevision: "rev-2", uncertainSaveRecordId: "r0" },
      recordId: "r0",
    });

    expect(fields).toEqual({ hasConflict: false, expectedRevisions: ["rev-1"], uncertainSaveRecordId: "r0" });
  });

  it("상대가 먼저 고쳤으면 충돌을 기억한다", () => {
    const fields = toFailedRecordFields({
      failure: failure({ hasConflict: true }),
      draft: { expectedRevisions: ["rev-1"], nextRevision: "rev-2", uncertainSaveRecordId: undefined },
      recordId: "r1",
    });

    expect(fields).toMatchObject({ hasConflict: true, uncertainSaveRecordId: undefined });
  });

  it("새 기록이 저장됐을 수 있으면 판 번호 없이 기록 id만 기억한다", () => {
    const fields = toFailedRecordFields({
      failure: failure({ mayHaveSaved: true }),
      draft: { expectedRevisions: undefined, nextRevision: undefined, uncertainSaveRecordId: undefined },
      recordId: "new-1",
    });

    expect(fields).toEqual({ hasConflict: false, expectedRevisions: undefined, uncertainSaveRecordId: "new-1" });
  });
});

describe("toRecordFormEnding", () => {
  it("문제가 없으면 저장 버튼을 둔다", () => {
    expect(toRecordFormEnding({ isRecordGone: false, linkedRecordId: undefined, hasConflict: undefined })).toEqual({ kind: "save" });
  });

  it("기록이 지워졌으면 다른 상태보다 먼저 기록 목록으로 가는 버튼을 둔다", () => {
    expect(toRecordFormEnding({ isRecordGone: true, linkedRecordId: "r1", hasConflict: true })).toEqual({ kind: "go-to-records" });
  });

  it("이미 남긴 기록이 있으면 충돌보다 먼저 그 기록으로 가는 링크를 둔다", () => {
    expect(toRecordFormEnding({ isRecordGone: false, linkedRecordId: "r1", hasConflict: true })).toEqual({ kind: "open-linked-record", recordId: "r1" });
  });

  it("상대가 먼저 고쳤으면 최신 내용 불러오기 버튼을 둔다", () => {
    expect(toRecordFormEnding({ isRecordGone: false, linkedRecordId: undefined, hasConflict: true })).toEqual({ kind: "reload-latest" });
  });
});

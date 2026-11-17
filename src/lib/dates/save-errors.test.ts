import { describe, expect, it } from "vitest";
import { PhotoError } from "@/lib/photos/errors";
import { DateRecordAlreadyLinkedError, DateRecordConflictError, DateRecordGoneError, SaveDateRecordError, toDateRecordSaveFailure } from "./save-errors";

const RECORD_ID = "10000000-0000-4000-8000-000000000001";

describe("toDateRecordSaveFailure", () => {
  it("지워진 기록이면 다시 저장할 곳이 없다고 알린다", () => {
    expect(toDateRecordSaveFailure(new DateRecordGoneError())).toEqual({
      message: "이 기록은 이미 지워졌어요. 기록 목록에서 다시 확인해 주세요.",
      isGone: true,
      hasConflict: false,
      mayHaveSaved: false,
    });
  });

  it("상대가 고쳤으면 충돌로, 그 전 시도가 저장됐을 수 있으면 그것도 함께 알린다", () => {
    const error = new DateRecordConflictError({ mayHaveSaved: true });

    expect(toDateRecordSaveFailure(error)).toEqual({ message: error.message, isGone: false, hasConflict: true, mayHaveSaved: true });
  });

  it("그 일정에 이미 남긴 기록이 있으면 그 문구를 보여 준다", () => {
    expect(toDateRecordSaveFailure(new DateRecordAlreadyLinkedError(RECORD_ID))).toEqual({
      message: "이 일정에는 이미 남긴 기록이 있어요.",
      isGone: false,
      hasConflict: false,
      mayHaveSaved: false,
    });
  });

  it("저장됐는지 모르면 저장됐을 수 있다고 알린다", () => {
    expect(toDateRecordSaveFailure(new SaveDateRecordError({ mayHaveSaved: true }, "확인하지 못했어요."))).toEqual({
      message: "확인하지 못했어요.",
      isGone: false,
      hasConflict: false,
      mayHaveSaved: true,
    });
  });

  it("사진 오류는 그 문구를, 알 수 없는 오류는 기본 문구를 보여 준다", () => {
    expect(toDateRecordSaveFailure(new PhotoError("too-large")).message).toBe("사진이 너무 커서 올릴 수 없어요.");
    expect(toDateRecordSaveFailure(new TypeError("bug"))).toEqual({
      message: "저장하지 못했어요. 잠시 후 다시 시도해 주세요.",
      isGone: false,
      hasConflict: false,
      mayHaveSaved: false,
    });
  });
});

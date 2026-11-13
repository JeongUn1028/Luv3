import { describe, expect, it, vi } from "vitest";
import {
  callWithRetry,
  createRowWithRetry,
  isDuplicateKey,
  isScreenOutdatedAfterFailure,
  isOutcomeUnknown,
  toRejectedOutcome,
  toSaveFailure,
  UNCERTAIN_SAVE_MESSAGE,
  updateRowWithRetry,
} from "./save-outcome";

interface RowsResult {
  data: { id: string }[] | null;
  error: { message: string; code?: string } | null;
}

interface RowResult {
  data: { id: string } | null;
  error: { message: string; code?: string } | null;
}

const LOST = { message: "TypeError: Failed to fetch", code: "" };
const REJECTED = { message: "거절", code: "23514" };
const DUPLICATE = { message: "중복", code: "23505" };

/** 차례로 결과를 돌려주는 요청. 결과를 다 쓰면 마지막 결과를 되풀이한다 */
const respondWith = <Result>(...results: Result[]) => {
  let index = 0;
  return vi.fn(async () => results[Math.min(index++, results.length - 1)] as Result);
};

describe("isOutcomeUnknown", () => {
  it.each(["22023", "23505", "42501", "P0002", "P0409", "PGRST116", "PGRST301"])("서버가 분명히 거절한 코드 %s면 거짓이다", (code) => {
    expect(isOutcomeUnknown({ code })).toBe(false);
  });

  it.each(["", "08006", "57P01", "PGRST000"])("저장됐는지 알 수 없는 코드 %s면 참이다", (code) => {
    expect(isOutcomeUnknown({ code })).toBe(true);
  });

  it("코드가 없으면(네트워크 오류) 참이다", () => {
    expect(isOutcomeUnknown({})).toBe(true);
  });
});

describe("isDuplicateKey", () => {
  it("같은 키가 이미 있다는 코드면 참이다", () => {
    expect(isDuplicateKey({ code: "23505" })).toBe(true);
  });

  it("다른 코드면 거짓이다", () => {
    expect(isDuplicateKey({ code: "23514" })).toBe(false);
  });
});

describe("callWithRetry", () => {
  it("성공하면 한 번만 보낸다", async () => {
    // Arrange
    const call = vi.fn(async () => ({ error: null }));

    // Act
    const result = await callWithRetry(call);

    // Assert
    expect(call).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ error: null, mayHaveApplied: false });
  });

  it("서버가 분명히 거절하면 다시 보내지 않는다", async () => {
    // Arrange
    const error = { message: "거절", code: "22023" };
    const call = vi.fn(async () => ({ error }));

    // Act
    const result = await callWithRetry(call);

    // Assert
    expect(call).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ error, mayHaveApplied: false });
  });

  it("응답이 끊기면 한 번 더 보내고, 첫 요청이 저장됐을 수 있다고 알린다", async () => {
    // Arrange
    const call = vi
      .fn<() => Promise<{ error: { message: string; code?: string } | null }>>()
      .mockResolvedValueOnce({ error: { message: "TypeError: Failed to fetch", code: "" } })
      .mockResolvedValueOnce({ error: null });

    // Act
    const result = await callWithRetry(call);

    // Assert
    expect(call).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ error: null, mayHaveApplied: true });
  });
});

describe("toRejectedOutcome", () => {
  it("서버가 분명히 거절했으면 failed다", () => {
    expect(toRejectedOutcome(REJECTED, false)).toBe("failed");
  });

  it("처리했는지 모르면 uncertain이다", () => {
    expect(toRejectedOutcome(LOST, false)).toBe("uncertain");
  });

  it("거절됐어도 앞선 요청이 저장됐을 수 있으면 uncertain이다", () => {
    expect(toRejectedOutcome(REJECTED, true)).toBe("uncertain");
  });
});

/** 바뀐 행이 없을 때 읽어 볼 행. 기본은 행이 그대로 있다(판 번호가 달라 거부됨) */
const rowStillThere = () => respondWith<RowResult>({ data: { id: "a" }, error: null });
const rowDeleted = () => respondWith<RowResult>({ data: null, error: null });

describe("updateRowWithRetry", () => {
  it("한 행이 바뀌면 saved다", async () => {
    expect(await updateRowWithRetry({ update: respondWith<RowsResult>({ data: [{ id: "a" }], error: null }), readRow: rowStillThere() })).toBe("saved");
  });

  it("바뀐 행이 없고 그 행이 그대로 있으면 열어 둔 사이 바뀐 것이라 conflict다", async () => {
    expect(await updateRowWithRetry({ update: respondWith<RowsResult>({ data: [], error: null }), readRow: rowStillThere() })).toBe("conflict");
  });

  it("바뀐 행이 없고 그 행도 없으면(그사이 지워짐) gone이다", async () => {
    expect(await updateRowWithRetry({ update: respondWith<RowsResult>({ data: [], error: null }), readRow: rowDeleted() })).toBe("gone");
  });

  it("바뀐 행이 없는데 다시 읽지 못하면 저장되지 않은 것이라 failed다", async () => {
    const readRow = respondWith<RowResult>({ data: null, error: REJECTED });

    expect(await updateRowWithRetry({ update: respondWith<RowsResult>({ data: [], error: null }), readRow })).toBe("failed");
  });

  it("서버가 분명히 거절하면 failed다", async () => {
    expect(await updateRowWithRetry({ update: respondWith<RowsResult>({ data: null, error: REJECTED }), readRow: rowStillThere() })).toBe("failed");
  });

  it("두 번 다 응답이 끊기면 uncertain이다", async () => {
    expect(await updateRowWithRetry({ update: respondWith<RowsResult>({ data: null, error: LOST }), readRow: rowStillThere() })).toBe("uncertain");
  });

  it("첫 응답이 끊긴 뒤 다시 보낸 것이 거절되면 첫 요청이 저장됐을 수 있어 uncertain이다", async () => {
    const update = respondWith<RowsResult>({ data: null, error: LOST }, { data: null, error: REJECTED });

    expect(await updateRowWithRetry({ update, readRow: rowStillThere() })).toBe("uncertain");
  });
});

describe("createRowWithRetry", () => {
  it("만들면 saved이고 고치지 않는다", async () => {
    // Arrange
    const update = respondWith<RowsResult>({ data: [{ id: "a" }], error: null });

    // Act
    const outcome = await createRowWithRetry({ insert: respondWith({ error: null }), update, readRow: rowStillThere() });

    // Assert
    expect(outcome).toBe("saved");
    expect(update).not.toHaveBeenCalled();
  });

  it("첫 응답이 끊겨 다시 보냈더니 같은 id가 있으면 이번 내용으로 고쳐 saved다", async () => {
    // Arrange
    const insert = respondWith({ error: LOST }, { error: DUPLICATE });
    const update = respondWith<RowsResult>({ data: [{ id: "a" }], error: null });

    // Act
    const outcome = await createRowWithRetry({ insert, update, readRow: rowStillThere() });

    // Assert
    expect(outcome).toBe("saved");
    expect(insert).toHaveBeenCalledTimes(2);
    expect(update).toHaveBeenCalledTimes(1);
  });

  it("같은 id가 있는데 그사이 상대가 고쳐 고치기가 거부되면, 앞선 시도가 만든 항목은 있으므로 saved다", async () => {
    const outcome = await createRowWithRetry({
      insert: respondWith({ error: DUPLICATE }),
      update: respondWith<RowsResult>({ data: [], error: null }),
      readRow: rowStillThere(),
    });

    expect(outcome).toBe("saved");
  });

  it("같은 id가 있는데 고치기가 거절되면 앞선 시도가 저장한 행이 있어 uncertain이다", async () => {
    const outcome = await createRowWithRetry({
      insert: respondWith({ error: DUPLICATE }),
      update: respondWith<RowsResult>({ data: null, error: REJECTED }),
      readRow: rowStillThere(),
    });

    expect(outcome).toBe("uncertain");
  });

  it("같은 id가 있는데 그사이 지워졌으면 gone이다", async () => {
    const outcome = await createRowWithRetry({
      insert: respondWith({ error: DUPLICATE }),
      update: respondWith<RowsResult>({ data: [], error: null }),
      readRow: rowDeleted(),
    });

    expect(outcome).toBe("gone");
  });

  it("서버가 분명히 거절하면 failed다", async () => {
    const outcome = await createRowWithRetry({ insert: respondWith({ error: REJECTED }), update: respondWith<RowsResult>({ data: [], error: null }), readRow: rowDeleted() });

    expect(outcome).toBe("failed");
  });

  it("두 번 다 응답이 끊기면 uncertain이다", async () => {
    const outcome = await createRowWithRetry({ insert: respondWith({ error: LOST }), update: respondWith<RowsResult>({ data: [], error: null }), readRow: rowDeleted() });

    expect(outcome).toBe("uncertain");
  });
});

describe("toSaveFailure", () => {
  const messages = { failedMessage: "저장 실패", goneMessage: "이미 지워짐", conflictMessage: "그사이 바뀜" };

  it("saved면 실패가 없다", () => {
    expect(toSaveFailure("saved", messages)).toBeUndefined();
  });

  it("failed면 실패 문구를 보여 주고 저장되지 않은 것이다", () => {
    expect(toSaveFailure("failed", messages)).toEqual({ message: "저장 실패", isGone: false, hasConflict: false, mayHaveSaved: false });
  });

  it("gone이면 지워졌다는 문구를 보여 준다", () => {
    expect(toSaveFailure("gone", messages)).toEqual({ message: "이미 지워짐", isGone: true, hasConflict: false, mayHaveSaved: false });
  });

  it("conflict면 그사이 바뀌었다고 알리고 저장되지 않은 것이다", () => {
    expect(toSaveFailure("conflict", messages)).toEqual({ message: "그사이 바뀜", isGone: false, hasConflict: true, mayHaveSaved: false });
  });

  it("uncertain이면 저장됐을 수 있다고 알린다", () => {
    expect(toSaveFailure("uncertain", messages)).toEqual({ message: UNCERTAIN_SAVE_MESSAGE, isGone: false, hasConflict: false, mayHaveSaved: true });
  });
});

describe("isScreenOutdatedAfterFailure", () => {
  it("지워졌거나, 저장됐을 수 있거나, 상대가 고쳤으면 숨겨 둔 화면을 새로 불러와야 한다", () => {
    expect(isScreenOutdatedAfterFailure({ isGone: true })).toBe(true);
    expect(isScreenOutdatedAfterFailure({ mayHaveSaved: true })).toBe(true);
    expect(isScreenOutdatedAfterFailure({ hasConflict: true })).toBe(true);
  });

  it("저장되지 않은 것이 분명한 실패면 화면을 그대로 둔다", () => {
    expect(isScreenOutdatedAfterFailure({ isGone: false, mayHaveSaved: false, hasConflict: false })).toBe(false);
    expect(isScreenOutdatedAfterFailure({})).toBe(false);
  });
});

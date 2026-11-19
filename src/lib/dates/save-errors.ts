import { PhotoError } from "@/lib/photos/errors";
import type { SaveFailure } from "@/lib/save-outcome";

/** 사진은 올렸지만 기록을 저장하지 못했을 때. `message`는 화면에 그대로 보여 줄 수 있다 */
export class SaveDateRecordError extends Error {
  /** 실패로 끝났지만 서버에 저장됐을 수 있는지. 그렇다면 다음 시도에 같은 id를 `draft.uncertainSaveRecordId`로 넘긴다 */
  readonly mayHaveSaved: boolean;

  constructor(options?: ErrorOptions & { mayHaveSaved?: boolean }, message = "기록을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.") {
    super(message, options);
    this.name = "SaveDateRecordError";
    this.mayHaveSaved = options?.mayHaveSaved ?? false;
  }
}

/**
 * 일정에서 남기려는데 그 일정의 그날에 이미 기록이 있을 때(#227). 다시 저장해도 거부되므로 남긴 기록으로 안내한다.
 *
 * @example if (error instanceof DateRecordAlreadyLinkedError && error.recordId) router.push(toRecordHref(error.recordId))
 */
export class DateRecordAlreadyLinkedError extends SaveDateRecordError {
  /** 이미 남긴 기록의 id. 그사이 지워졌으면 undefined */
  readonly recordId: string | undefined;

  constructor(recordId: string | undefined, options?: ErrorOptions) {
    super(options, "이 일정에는 이미 남긴 기록이 있어요.");
    this.name = "DateRecordAlreadyLinkedError";
    this.recordId = recordId || undefined;
  }
}

/** 고치는 사이 상대가 기록을 지웠을 때. 다시 시도해도 실패하므로 재시도를 권하지 않는다 */
export class DateRecordGoneError extends SaveDateRecordError {
  constructor(options?: ErrorOptions) {
    super(options, "이 기록은 이미 지워졌어요. 기록 목록에서 다시 확인해 주세요.");
    this.name = "DateRecordGoneError";
  }
}

/**
 * 고치는 사이 상대가 기록을 고쳐 저장을 거부했을 때. 그대로 저장하면 상대의 사진과 글을 지우게 된다.
 *
 * @example if (error instanceof DateRecordConflictError) setDraft((current) => ({ ...current, hasConflict: true }));
 */
export class DateRecordConflictError extends SaveDateRecordError {
  constructor(options?: ErrorOptions & { mayHaveSaved?: boolean }) {
    super(
      options,
      options?.mayHaveSaved
        ? "그사이 이 기록이 바뀌었어요. 앞서 저장한 내용이 반영됐을 수 있어요. 최신 내용을 불러와 확인해 주세요. 지금 쓴 내용은 사라져요."
        : "그사이 이 기록이 바뀌어 저장하지 않았어요. 최신 내용을 불러와 다시 고쳐 주세요. 지금 쓴 내용은 사라져요.",
    );
    this.name = "DateRecordConflictError";
  }
}

/**
 * 기록 저장 오류를 일정·할 일 폼과 같은 실패 모양으로 바꾼다(#315). 문구는 화면에 그대로 보여 줄 수 있다.
 *
 * @example const failure = toDateRecordSaveFailure(error)
 */
export const toDateRecordSaveFailure = (error: unknown): SaveFailure => ({
  message: error instanceof PhotoError || error instanceof SaveDateRecordError ? error.message : "저장하지 못했어요. 잠시 후 다시 시도해 주세요.",
  isGone: error instanceof DateRecordGoneError,
  hasConflict: error instanceof DateRecordConflictError,
  mayHaveSaved: error instanceof SaveDateRecordError && error.mayHaveSaved,
});

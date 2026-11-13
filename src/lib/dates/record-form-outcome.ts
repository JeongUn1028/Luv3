import { toFailedSaveFields } from "@/lib/revision";
import type { SaveFailure } from "@/lib/save-outcome";
import type { DateRecordDraft } from "./form";

/** 실패를 견줄 때 쓰는 기록 입력값의 칸 */
type FailedRecordDraft = Pick<DateRecordDraft, "expectedRevisions" | "nextRevision" | "uncertainSaveRecordId">;

interface ToFailedRecordFieldsParams {
  failure: Pick<SaveFailure, "hasConflict" | "mayHaveSaved">;
  /** 방금 저장을 시도한 입력값 */
  draft: FailedRecordDraft;
  /** 방금 저장을 시도한 기록 id */
  recordId: string;
}

/** 저장에 실패한 기록 폼이 다음 시도를 위해 기억할 칸 */
type FailedRecordFields = Pick<DateRecordDraft, "hasConflict" | "expectedRevisions" | "uncertainSaveRecordId">;

/**
 * 저장에 실패한 기록 폼이 기억할 칸. 일정·할 일과 같은 판 번호·충돌(`toFailedSaveFields`)에 더해,
 * 저장됐을 수 있으면 다시 저장할 때 같은 기록 id를 써서 기록이 둘이 되지 않게 한다.
 *
 * @example setDraft((current) => ({ ...current, ...toFailedRecordFields({ failure, draft: nextDraft, recordId }) }))
 */
export const toFailedRecordFields = ({ failure, draft, recordId }: ToFailedRecordFieldsParams): FailedRecordFields => ({
  ...toFailedSaveFields({ failure, expectedRevisions: draft.expectedRevisions, revision: draft.nextRevision }),
  uncertainSaveRecordId: failure.mayHaveSaved ? recordId : draft.uncertainSaveRecordId,
});

/** 기록 폼 맨 아래에 둘 것: 기록 목록으로 가기, 이미 남긴 기록 보기(그 기록 id), 최신 내용 불러오기, 저장 */
export type RecordFormEnding =
  | { kind: "go-to-records" }
  | { kind: "open-linked-record"; recordId: string }
  | { kind: "reload-latest" }
  | { kind: "save" };

interface ToRecordFormEndingParams {
  /** 고치는 사이 기록이 지워졌는지 */
  isRecordGone: boolean;
  /** 일정에서 남기려는데 그 일정의 그날에 이미 남긴 기록 id(#227) */
  linkedRecordId: string | undefined;
  /** 상대가 먼저 고쳐 저장이 거부됐는지 */
  hasConflict: boolean | undefined;
}

/**
 * 기록 폼 맨 아래에 둘 것. 다시 저장해도 실패하는 경우에는 저장 버튼 대신 나갈 길을 준다(지워짐 → 이미 남긴 기록 → 충돌 순서).
 *
 * @example toRecordFormEnding({ isRecordGone: false, linkedRecordId: undefined, hasConflict: true }) // { kind: "reload-latest" }
 */
export const toRecordFormEnding = ({ isRecordGone, linkedRecordId, hasConflict }: ToRecordFormEndingParams): RecordFormEnding => {
  if (isRecordGone) return { kind: "go-to-records" };
  if (linkedRecordId) return { kind: "open-linked-record", recordId: linkedRecordId };
  return { kind: hasConflict ? "reload-latest" : "save" };
};

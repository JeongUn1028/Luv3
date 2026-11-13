"use client";

import { useState, type Dispatch, type SetStateAction } from "react";
import { RECORDS_PATH } from "@/lib/dates/album";
import type { EditableRecord } from "@/lib/dates/detail";
import type { DateRecordDraft } from "@/lib/dates/form";
import { getDraftPhotos } from "@/lib/dates/photo-group-draft";
import { toFailedRecordFields } from "@/lib/dates/record-form-outcome";
import { DateRecordAlreadyLinkedError, saveDateRecord, toDateRecordSaveFailure, updateDateRecord, type SaveProgress } from "@/lib/dates/save";
import { forgetScrollPosition } from "@/lib/navigation/scroll-memory";
import type { LeavableSave } from "@/lib/navigation/use-leavable-save";
import { ALBUM_BUCKET } from "@/lib/photos/limits";
import type { PreviewUrls } from "@/lib/photos/preview-urls";
import { resizePhoto } from "@/lib/photos/resize";
import { createClient } from "@/lib/supabase/client";
import type { PickedPhoto } from "../PhotoGroupCard";

type RecordDraft = DateRecordDraft<PickedPhoto>;

interface UseRecordSaveParams {
  /** 고칠 기록. 없으면 새 기록을 저장한다 */
  record: EditableRecord | undefined;
  setDraft: Dispatch<SetStateAction<RecordDraft>>;
  /** 폼 아래 안내. 저장을 시작하면 지우고 실패하면 이유를 적는다 */
  setNotice: Dispatch<SetStateAction<string | undefined>>;
  previews: PreviewUrls;
  /** 저장하는 동안 폼을 떠나도 결과를 알리는 저장(#104) */
  leavableSave: Pick<LeavableSave<RecordDraft>, "beginSave" | "finishSaved" | "finishFailed">;
}

interface SaveRecordParams {
  /** 검사를 마친 입력값 */
  draft: RecordDraft;
  recordId: string;
  /** 저장한 뒤 폼을 처음부터 다시 쓰는 상태로 되돌린다 */
  reset: () => void;
}

interface RecordSave {
  isSaving: boolean;
  progress: SaveProgress | undefined;
  /** 고치는 사이 기록이 지워져 저장할 곳이 없는지 */
  isRecordGone: boolean;
  /** 일정에서 남기려는데 그 일정의 그날에 이미 남긴 기록이 있으면 그 기록 id(#227) */
  linkedRecordId: string | undefined;
  save: (params: SaveRecordParams) => Promise<void>;
  /** 폼을 처음부터 다시 쓸 때 이 훅의 상태를 되돌린다. 지워졌다는 표시만은 되돌려도 저장할 곳이 없어 그대로 둔다(나누기 전과 같다) */
  resetSaveState: () => void;
}

/**
 * 기록 폼의 저장 흐름(#315): 새로 고른 사진을 줄여 올린 뒤 기록과 사진 행을 한 번에 저장하고, 진행을 알리며, 실패하면 다음 시도에 필요한 칸을 기억한다.
 * 저장하는 동안 폼을 떠나도 저장을 이어 가고 결과를 알린다(`useLeavableSave`).
 *
 * @example const recordSave = useRecordSave({ record, setDraft, setNotice, previews, leavableSave }); await recordSave.save({ draft: nextDraft, recordId, reset })
 */
export const useRecordSave = ({ record, setDraft, setNotice, previews, leavableSave }: UseRecordSaveParams): RecordSave => {
  const { beginSave, finishSaved, finishFailed } = leavableSave;
  const [isRecordGone, setIsRecordGone] = useState(false);
  const [linkedRecordId, setLinkedRecordId] = useState<string>();
  const [progress, setProgress] = useState<SaveProgress>();
  const [isSaving, setIsSaving] = useState(false);

  const save = async ({ draft, recordId, reset }: SaveRecordParams) => {
    beginSave();
    setNotice(undefined);
    setIsSaving(true);
    try {
      const supabase = createClient();
      const storage = supabase.storage.from(ALBUM_BUCKET);
      const files = new Map(getDraftPhotos(draft.groups).flatMap(({ id, file }) => (file ? [[id, file] as const] : [])));
      let savedHref = record ? `/dates/${record.id}` : RECORDS_PATH;
      if (record) {
        await updateDateRecord({
          recordId,
          draft,
          files,
          storage,
          resize: resizePhoto,
          updateRecord: (args) => supabase.rpc("update_date_record", args),
          onProgress: setProgress,
        });
      } else {
        const result = await saveDateRecord({
          recordId,
          draft,
          files,
          storage,
          resize: resizePhoto,
          createRecord: (args) => supabase.rpc("create_date_record", args),
          onProgress: setProgress,
        });
        // 앞서 저장된 기록이 있어 이번 내용은 반영되지 않았으니, 저장된 내용을 바로 확인하게 한다
        if (result === "already-saved") savedHref = `/dates/${recordId}`;
      }
      // cacheComponents는 다녀온 화면을 Activity로 숨겨 상태를 보존한다. 다시 열었을 때 처음 상태가 되도록
      // 이동과 같은 transition에서 되돌린다(이동이 끝날 때 함께 반영돼 빈 폼이 잠깐 보이지 않는다)
      // 이미 그려진 미리보기는 URL을 해제해도 그대로 보인다. 수정 화면은 페이지가 매번 새 key로 다시 그린다
      getDraftPhotos(draft.groups).forEach(({ previewUrl }) => previews.revoke(previewUrl));
      // 목록은 날짜 내림차순이라 새 기록은 맨 위에 있다. 보던 위치로 돌아가면 저장되지 않은 것처럼 보인다
      if (!record) forgetScrollPosition("records");
      finishSaved({ href: savedHref, reset });
    } catch (error) {
      const failure = toDateRecordSaveFailure(error);
      const failedFields = toFailedRecordFields({ failure, draft, recordId });
      setDraft((current) => ({ ...current, ...failedFields }));
      setIsRecordGone(failure.isGone);
      setLinkedRecordId(error instanceof DateRecordAlreadyLinkedError ? error.recordId : undefined);
      setNotice(failure.message);
      setIsSaving(false);
      setProgress(undefined);
      finishFailed({ draft: { ...draft, ...failedFields }, ...failure });
    }
  };

  const resetSaveState = () => {
    setLinkedRecordId(undefined);
    setProgress(undefined);
    setIsSaving(false);
  };

  return { isSaving, progress, isRecordGone, linkedRecordId, save, resetSaveState };
};

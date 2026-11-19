"use client";

import { useState, type ReactElement, type SubmitEvent } from "react";
import { AuthorTag } from "@/components/AuthorTag";
import { FormFooter } from "@/components/FormFooter";
import { DateField, TextAreaField, TextField } from "@/components/FormField";
import { PageShell } from "@/components/PageShell";
import { ReloadLatestButton } from "@/components/ReloadLatestButton";
import { SaveButton } from "@/components/SaveButton";
import { ScreenHeader } from "@/components/ScreenHeader";
import { toCalendarHref } from "@/lib/calendar/month";
import { changeDraftScope, type ScopeValues } from "@/lib/events/edit-scope";
import {
  EVENT_MEMO_MAX_LENGTH,
  EVENT_PLACE_MAX_LENGTH,
  EVENT_TITLE_MAX_LENGTH,
  validateEventDraft,
  type EventDraft,
  type EventDraftErrors,
  type EventEditScope,
  toWrittenFields,
} from "@/lib/events/form";
import type { EventRecordLink } from "@/lib/events/record-link";
import { showInvalidFields } from "@/lib/focus-invalid-field";
import { clearErrors, clearFieldError, isResolvedFieldNotice, isSameFormValue } from "@/lib/form";
import { useLeavableSave, type FailedSave } from "@/lib/navigation/use-leavable-save";
import { EventKindField, EventScopeField } from "./event-form/EventChoiceFields";
import { EventFormActions } from "./event-form/EventFormActions";
import { EventSpanFields, type EventTextField } from "./event-form/EventSpanFields";
import { useEventSave } from "./event-form/use-event-save";

const failedSaves = new Map<string, FailedSave<EventDraft>>();

interface EventFormProps {
  initialDraft: EventDraft;
  /** 고칠 일정의 id. 없으면 새 일정을 만든다 */
  eventId?: string;
  /** 고칠 일정의 작성자 닉네임. 있으면 제목 옆에 작성자 이름표를 그린다 */
  authorNickname?: string;
  /** 함께 일정이 아닐 때 선택지에 쓰는 닉네임. 새 일정은 현재 사용자, 고칠 일정은 그 작성자다 */
  ownerNickname: string;
  /** 반복 일정의 어느 날을 눌렀는지. 있으면 "이 날만 / 전체"를 고른다 */
  occurrence?: { date: string; startDate: string };
  /** 기간 일정의 어느 날을 눌렀는지. 돌아갈 때 그날을 고른다 */
  viewedDate?: string | undefined;
  /** 반복 중 하루만 고쳐 따로 나온 일정인지. 다시 반복으로 바꾸지 않는다 */
  isDetached?: boolean;
  /** 고치는 날에 남긴 기록으로 가거나 그날로 기록을 남기는 버튼(#227). 없으면 버튼을 그리지 않는다 */
  recordLink?: EventRecordLink | undefined;
}

/** 공유 캘린더 일정 추가·수정 폼 */
export const EventForm = ({
  initialDraft,
  eventId,
  authorNickname,
  ownerNickname,
  occurrence,
  viewedDate,
  isDetached = false,
  recordLink,
}: EventFormProps): ReactElement => {
  // 캘린더에서 고른 날마다 다른 폼이다. 다른 날의 실패한 내용이 채워지지 않게 날짜까지 구분한다
  const formKey = `event:${eventId ? `${eventId}:${occurrence?.date ?? ""}` : `new:${initialDraft.date}`}`;
  const { failedSave, ...leavableSave } = useLeavableSave({ formKey, subject: "일정을", failedSaves });
  const [draft, setDraft] = useState(failedSave?.draft ?? initialDraft);
  // 쓴 내용이 있는지 견줄 처음 내용. 상대가 고쳐 화면을 새로 받아도 폼은 처음 내용 그대로라 이 값과 견준다
  const [baseDraft, setBaseDraft] = useState(initialDraft);
  const [errors, setErrors] = useState<EventDraftErrors>({});
  // 범위를 바꿨다 돌아와도 고쳐 둔 날짜·함께 여부를 잃지 않게 범위마다 남긴다(#261)
  const [scopeValues, setScopeValues] = useState<ScopeValues>({});
  const [notice, setNotice] = useState(failedSave?.message);
  // 칸 오류를 모두 고치면 저장을 다시 누르기 전이라도 안내를 지운다. 효과로 지우면 한 번 더 그려지므로 그리는 중에 맞춘다
  if (isResolvedFieldNotice(notice, errors)) setNotice(undefined);
  // 캘린더로 돌아가면 일정 날짜가 속한 달을 열고 그날을 고른다
  const backDate = viewedDate ?? initialDraft.date;
  const backHref = toCalendarHref({ date: backDate });
  const { isSaving, save } = useEventSave({
    initialDraft,
    eventId,
    pendingAuthorNickname: eventId ? authorNickname : ownerNickname,
    occurrence,
    viewedDate,
    backDate,
    setDraft,
    setNotice,
    leavableSave,
  });
  // 저장하는 동안은 나가도 저장을 이어 가고 결과를 알리므로 묻지 않는다(#104)
  const shouldConfirmLeave = !isSameFormValue(toWrittenFields(draft), toWrittenFields(baseDraft)) && !isSaving;
  const isOccurrenceScope = draft.scope === "occurrence";
  const dateLabel = draft.endDate === undefined ? "날짜" : "시작 날짜";
  const deleteOccurrenceDate = isOccurrenceScope ? occurrence?.date : undefined;

  const updateField = (field: EventTextField, value: string) => {
    setDraft((current) => ({ ...current, [field]: value }));
    setErrors((current) => clearFieldError(current, field));
  };

  const changeScope = (scope: EventEditScope) => {
    if (!occurrence) return;
    const changed = changeDraftScope({ draft, scope, occurrence, isTogether: initialDraft.isTogether, scopeValues });
    setDraft(changed.draft);
    setScopeValues(changed.scopeValues);
    setErrors((current) => clearErrors(current, ["date", "repeatUntil", "endDate"]));
  };

  const handleSubmit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSaving) return;
    if (showInvalidFields({ form: event.currentTarget, errors: validateEventDraft(draft), setErrors, setNotice })) return;
    await save({
      draft,
      reset: () => {
        setDraft(initialDraft);
        setBaseDraft(initialDraft);
        setScopeValues({});
      },
    });
  };

  return (
    <PageShell
      bottomSpace="sm"
      className="px-4"
      header={
        <ScreenHeader
          back={{ href: backHref, shouldConfirmLeave }}
          title={eventId ? "일정 고치기" : "일정 추가"}
          titleAddon={authorNickname && <AuthorTag nickname={authorNickname} className="ml-2" />}
          actions={
            eventId && (
              <EventFormActions
                eventId={eventId}
                formKey={formKey}
                initialDraft={initialDraft}
                deleteOccurrenceDate={deleteOccurrenceDate}
                backDate={backDate}
                recordLink={recordLink}
              />
            )
          }
        />
      }
    >
      {/* 칸이 많아 간격을 좁혀야 메모 4줄이 15 Pro 화면에 들어온다. 남은 높이는 메모 칸이 채워 기기마다 저장 버튼이 같은 자리에 온다(#57) */}
      <form onSubmit={handleSubmit} noValidate className="mt-3 flex flex-1 flex-col gap-4">
        {occurrence && <EventScopeField scope={draft.scope} isDisabled={isSaving} onChange={changeScope} />}

        <TextField
          id="event-title"
          label="제목"
          value={draft.title}
          placeholder="무엇을 하나요?"
          maxLength={EVENT_TITLE_MAX_LENGTH * 2}
          disabled={isSaving}
          error={errors.title}
          onChange={(value) => updateField("title", value)}
        />

        <EventKindField
          ownerNickname={ownerNickname}
          isTogether={draft.isTogether}
          // 함께 여부는 반복 전체에 하나다
          isDisabled={isSaving || isOccurrenceScope}
          onChange={(isTogether) => setDraft((current) => ({ ...current, isTogether }))}
        />

        <DateField
          id="event-date"
          label={dateLabel}
          value={draft.date}
          isDisabled={isSaving}
          error={errors.date}
          onChange={(date) => updateField("date", date)}
        />

        <EventSpanFields
          draft={draft}
          errors={errors}
          isDisabled={isSaving}
          // 이 날만 고칠 때와 따로 나온 일정은 반복과 기간을 바꾸지 않는다
          canEditSpan={!isOccurrenceScope && !isDetached}
          setDraft={setDraft}
          setErrors={setErrors}
          onFieldChange={updateField}
        />

        <TextField
          id="event-place"
          label="장소"
          hint="선택"
          value={draft.place}
          maxLength={EVENT_PLACE_MAX_LENGTH * 2}
          disabled={isSaving}
          error={errors.place}
          onChange={(value) => updateField("place", value)}
        />

        <TextAreaField
          id="event-memo"
          label="메모"
          hint="선택"
          value={draft.memo}
          rows={4}
          maxLength={EVENT_MEMO_MAX_LENGTH * 2}
          disabled={isSaving}
          error={errors.memo}
          onChange={(value) => updateField("memo", value)}
          className="grow"
        />

        <FormFooter notice={notice}>
          {draft.hasConflict ? <ReloadLatestButton /> : <SaveButton isDisabled={isSaving}>{isSaving ? "저장 중…" : "저장"}</SaveButton>}
        </FormFooter>
      </form>
    </PageShell>
  );
};

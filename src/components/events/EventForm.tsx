"use client";

import { useRouter } from "next/navigation";
import { startTransition, useState, type ReactElement, type SubmitEvent } from "react";
import { AuthorTag } from "@/components/AuthorTag";
import { ConfirmDeleteButton } from "@/components/ConfirmDeleteButton";
import { DatePickerField } from "@/components/DatePickerField";
import { EventRecordAction } from "@/components/events/EventRecordAction";
import { PageShell } from "@/components/PageShell";
import { ScreenHeader } from "@/components/ScreenHeader";
import { getEventKinds, getHighlightClassNames } from "@/lib/calendar/highlight";
import { formatDayHeading, toCalendarHref } from "@/lib/calendar/month";
import { isRepeatRule } from "@/lib/events/calendar";
import {
  EVENT_MEMO_MAX_LENGTH,
  EVENT_PLACE_MAX_LENGTH,
  EVENT_TITLE_MAX_LENGTH,
  changeDraftScope,
  getDateAfterSave,
  getMinDateAfterStart,
  validateEventDraft,
  type EventDraft,
  type EventDraftErrors,
  type EventEditScope,
} from "@/lib/events/form";
import type { EventRecordLink } from "@/lib/events/record-link";
import { formatEventPeriod, formatRepeatRule, REPEAT_RULES } from "@/lib/events/recurrence";
import { deleteEvent, saveEvent } from "@/lib/events/save";
import { clearError, isSameFormValue } from "@/lib/form";
import { BACK_TRANSITION } from "@/lib/navigation/transition";
import { useLeavableSave, type FailedSave } from "@/lib/navigation/use-leavable-save";

const labelClassName = "text-[13px] text-ink-sub";
const inputClassName =
  "mt-2 h-[51px] w-full rounded-[10px] border border-line bg-surface px-4 text-ink placeholder:text-ink-placeholder focus:border-accent focus:outline-none aria-[invalid=true]:border-accent";
const errorClassName = "mt-2 text-[12px] text-accent";
const choiceClassName =
  "flex h-[51px] min-w-0 items-center justify-center gap-2 rounded-[10px] border border-line bg-surface px-3 text-[15px] text-ink-sub has-checked:border-accent has-checked:text-ink has-focus-visible:outline-2 has-focus-visible:outline-accent has-disabled:opacity-50";

const EDIT_SCOPES: { scope: EventEditScope; label: string }[] = [
  { scope: "occurrence", label: "이 날만" },
  { scope: "all", label: "전체" },
];

type TextField = "date" | "startTime" | "title" | "place" | "memo" | "repeatUntil" | "endDate";

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

/** 삭제 확인 창의 문구 */
const toDeleteDialog = (
  { date, endDate, title, repeatRule }: EventDraft,
  occurrenceDate: string | undefined,
): { title: string; description: string } => {
  if (occurrenceDate) {
    return {
      title: "이 날 일정을 지울까요?",
      description: `"${title}" 일정의 ${formatDayHeading(occurrenceDate)} 하루만 두 사람 캘린더에서 지워져요.`,
    };
  }
  if (repeatRule) {
    return {
      title: "반복 일정 전체를 지울까요?",
      description: `"${title}" 일정의 모든 날이 두 사람 캘린더에서 지워져요. 따로 고친 날도 함께 지워져요.`,
    };
  }
  if (endDate) {
    return {
      title: "기간 일정을 지울까요?",
      description: `"${title}" 일정의 ${formatEventPeriod({ start: date, end: endDate })} 모든 날이 두 사람 캘린더에서 지워져요.`,
    };
  }
  return { title: "이 일정을 지울까요?", description: `"${title}" 일정이 두 사람 캘린더에서 모두 지워져요.` };
};

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
  const router = useRouter();
  // 캘린더에서 고른 날마다 다른 폼이다. 다른 날의 실패한 내용이 채워지지 않게 날짜까지 구분한다
  const formKey = `event:${eventId ? `${eventId}:${occurrence?.date ?? ""}` : `new:${initialDraft.date}`}`;
  const { failedSave, beginSave, finishSaved, finishFailed } = useLeavableSave({ formKey, subject: "일정을", failedSaves });
  const [draft, setDraft] = useState(failedSave?.draft ?? initialDraft);
  // 쓴 내용이 있는지 견줄 처음 내용. 상대가 고쳐 화면을 새로 받아도 폼은 처음 내용 그대로라 이 값과 견준다
  const [baseDraft, setBaseDraft] = useState(initialDraft);
  const [errors, setErrors] = useState<EventDraftErrors>({});
  const [notice, setNotice] = useState(failedSave?.message);
  const [isSaving, setIsSaving] = useState(false);
  // 저장하는 동안은 나가도 저장을 이어 가고 결과를 알리므로 묻지 않는다(#104)
  const shouldConfirmLeave = !isSameFormValue(draft, baseDraft) && !isSaving;
  // 캘린더로 돌아가면 일정 날짜가 속한 달을 열고 그날을 고른다
  const backDate = viewedDate ?? initialDraft.date;
  const backHref = toCalendarHref({ date: backDate });
  const isOccurrenceScope = draft.scope === "occurrence";
  // 이 날만 고칠 때와 따로 나온 일정은 반복과 기간을 바꾸지 않는다
  const canEditSpan = !isOccurrenceScope && !isDetached;
  const isPeriod = draft.endDate !== undefined;
  const dateLabel = isPeriod ? "시작 날짜" : "날짜";
  const deleteOccurrenceDate = isOccurrenceScope ? occurrence?.date : undefined;

  const updateField = (field: TextField, value: string) => {
    setDraft((current) => ({ ...current, [field]: value }));
    setErrors((current) => {
      const cleared = clearError(current, field);
      // 끝 날짜 에러는 시작 날짜에 따라 달라지므로, 시작 날짜를 고치면 함께 지우고 저장할 때 다시 확인한다
      return field === "date" ? clearError(cleared, "endDate") : cleared;
    });
  };

  const handlePeriodChange = (isChecked: boolean) => {
    setDraft((current) => ({ ...current, endDate: isChecked ? "" : undefined }));
    setErrors((current) => clearError(current, "endDate"));
  };

  const changeScope = (scope: EventEditScope) => {
    if (!occurrence) return;
    setDraft((current) => changeDraftScope(current, scope, occurrence, initialDraft.isTogether));
    setErrors((current) => clearError(clearError(clearError(current, "date"), "repeatUntil"), "endDate"));
  };

  const goToCalendar = (date: string) => {
    startTransition(() => {
      router.replace(toCalendarHref({ date }), { transitionTypes: BACK_TRANSITION });
      router.refresh();
    });
  };

  const handleSubmit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSaving) return;

    const nextErrors = validateEventDraft(draft);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      setNotice("입력한 내용을 확인해 주세요.");
      return;
    }

    beginSave();
    setNotice(undefined);
    setIsSaving(true);
    const failure = await saveEvent({ draft, eventId, occurrenceDate: occurrence?.date });
    if (failure) {
      setNotice(failure.message);
      setIsSaving(false);
      finishFailed({ draft, message: failure.message, isGone: failure.isGone });
      return;
    }
    finishSaved({
      href: toCalendarHref({ date: getDateAfterSave(draft, { occurrenceDate: occurrence?.date, viewedDate }) }),
      reset: () => {
        setDraft(initialDraft);
        setBaseDraft(initialDraft);
        setIsSaving(false);
      },
    });
  };

  const handleDelete = async () => {
    if (!eventId) return;
    await deleteEvent({ eventId, occurrenceDate: deleteOccurrenceDate });
    goToCalendar(backDate);
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
              <>
                {recordLink && (
                  <EventRecordAction
                    eventId={eventId}
                    link={recordLink}
                    className="press-icon flex h-11 shrink-0 items-center px-3 text-[14px] text-ink-sub hover:text-ink"
                  />
                )}
                <ConfirmDeleteButton
                  {...toDeleteDialog(initialDraft, deleteOccurrenceDate)}
                  onConfirm={handleDelete}
                  failureMessage="일정을 지우지 못했어요. 잠시 후 다시 시도해 주세요."
                />
              </>
            )
          }
        />
      }
    >
      {/* 칸이 많아 간격을 좁혀야 메모 4줄이 15 Pro 화면에 들어온다. 남은 높이는 메모 칸이 채워 기기마다 저장 버튼이 같은 자리에 온다(#57) */}
      <form onSubmit={handleSubmit} noValidate className="mt-3 flex flex-1 flex-col gap-4">
        {occurrence && (
          <fieldset className="flex flex-col">
            <legend className={labelClassName}>고칠 범위</legend>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {EDIT_SCOPES.map(({ scope, label }) => (
                <label key={scope} className={choiceClassName}>
                  <input
                    type="radio"
                    name="event-scope"
                    checked={draft.scope === scope}
                    disabled={isSaving}
                    onChange={() => changeScope(scope)}
                    className="sr-only"
                  />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>
        )}

        <div className="flex flex-col">
          <label htmlFor="event-title" className={labelClassName}>
            제목
          </label>
          <input
            id="event-title"
            value={draft.title}
            placeholder="무엇을 하나요?"
            maxLength={EVENT_TITLE_MAX_LENGTH * 2}
            disabled={isSaving}
            aria-invalid={Boolean(errors.title)}
            aria-describedby={errors.title ? "event-title-error" : undefined}
            onChange={(event) => updateField("title", event.target.value)}
            className={inputClassName}
          />
          {errors.title && (
            <p id="event-title-error" className={errorClassName}>
              {errors.title}
            </p>
          )}
        </div>

        <fieldset className="flex flex-col">
          <legend className={labelClassName}>누구 일정</legend>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {getEventKinds(ownerNickname).map(({ isTogether, highlight, label }) => (
              <label key={highlight} className={choiceClassName}>
                <input
                  type="radio"
                  name="event-kind"
                  checked={draft.isTogether === isTogether}
                  // 함께 여부는 반복 전체에 하나다
                  disabled={isSaving || isOccurrenceScope}
                  onChange={() => setDraft((current) => ({ ...current, isTogether }))}
                  className="sr-only"
                />
                {/* 캘린더 형광펜과 같은 색 띠로, 고른 종류가 캘린더에서 어떤 색으로 보일지 알려 준다 */}
                <span
                  aria-hidden="true"
                  className={`h-2.5 w-4 shrink-0 -rotate-2 rounded-[2px] ${getHighlightClassNames({ highlight, isCurrentMonth: true }).band}`}
                />
                <span className="truncate">{label}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="flex flex-col">
          <label htmlFor="event-date" className={labelClassName}>
            {dateLabel}
          </label>
          <DatePickerField
            id="event-date"
            label={dateLabel}
            value={draft.date}
            isDisabled={isSaving}
            isInvalid={Boolean(errors.date)}
            describedBy={errors.date ? "event-date-error" : undefined}
            onChange={(date) => updateField("date", date)}
            className={inputClassName}
          />
          {errors.date && (
            <p id="event-date-error" className={errorClassName}>
              {errors.date}
            </p>
          )}
        </div>

        <div className="flex flex-col">
          {/* 기간과 반복을 같은 줄에 두어 폼 높이가 늘지 않게 한다. 일정 폼은 높이 여유가 거의 없다(#57) */}
          <div className="flex h-11 items-center justify-between gap-3">
            <div className="flex items-center gap-4">
              <label className="flex h-11 items-center gap-2 text-[15px] text-ink">
                <input
                  type="checkbox"
                  checked={draft.isAllDay}
                  disabled={isSaving}
                  onChange={(event) => {
                    const isAllDay = event.target.checked;
                    setDraft((current) => ({ ...current, isAllDay }));
                    setErrors((current) => clearError(current, "startTime"));
                  }}
                  className="size-5 accent-accent"
                />
                종일
              </label>
              {canEditSpan && (
                <label className="flex h-11 items-center gap-2 text-[15px] text-ink has-disabled:opacity-50">
                  <input
                    type="checkbox"
                    checked={isPeriod}
                    disabled={isSaving || Boolean(draft.repeatRule)}
                    onChange={(event) => handlePeriodChange(event.target.checked)}
                    className="size-5 accent-accent"
                  />
                  기간
                </label>
              )}
            </div>
            {canEditSpan && (
              <label htmlFor="event-repeat" className="flex h-11 min-w-0 items-center gap-2 text-[13px] text-ink-sub has-disabled:opacity-50">
                반복
                <select
                  id="event-repeat"
                  value={draft.repeatRule ?? ""}
                  disabled={isSaving || isPeriod}
                  onChange={(event) => {
                    const { value } = event.target;
                    setDraft((current) => ({ ...current, repeatRule: isRepeatRule(value) ? value : undefined }));
                    setErrors((current) => clearError(current, "repeatUntil"));
                  }}
                  className="h-11 min-w-0 rounded-[10px] bg-transparent text-ink focus:outline-accent"
                >
                  <option value="">안 함</option>
                  {REPEAT_RULES.map((rule) => (
                    <option key={rule} value={rule}>
                      {formatRepeatRule(rule)}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
          {canEditSpan && (isPeriod || draft.repeatRule) && (
            <p className={labelClassName}>기간과 반복은 함께 쓸 수 없어요.</p>
          )}
          {canEditSpan && isPeriod && (
            <>
              <label htmlFor="event-end-date" className={`${labelClassName} mt-3`}>
                끝 날짜
              </label>
              <DatePickerField
                id="event-end-date"
                label="끝 날짜"
                min={getMinDateAfterStart(draft.date)}
                value={draft.endDate ?? ""}
                openDate={draft.date}
                isDisabled={isSaving}
                isInvalid={Boolean(errors.endDate)}
                describedBy={errors.endDate ? "event-end-date-error" : undefined}
                onChange={(date) => updateField("endDate", date)}
                className={inputClassName}
              />
              {errors.endDate && (
                <p id="event-end-date-error" className={errorClassName}>
                  {errors.endDate}
                </p>
              )}
            </>
          )}
          {!draft.isAllDay && (
            <>
              <label htmlFor="event-time" className={`${labelClassName} mt-3`}>
                시간
              </label>
              <input
                id="event-time"
                type="time"
                value={draft.startTime}
                disabled={isSaving}
                aria-invalid={Boolean(errors.startTime)}
                aria-describedby={errors.startTime ? "event-time-error" : undefined}
                onChange={(event) => updateField("startTime", event.target.value)}
                className={inputClassName}
              />
              {errors.startTime && (
                <p id="event-time-error" className={errorClassName}>
                  {errors.startTime}
                </p>
              )}
            </>
          )}
          {canEditSpan && draft.repeatRule && (
            <>
              <label htmlFor="event-repeat-until" className={`${labelClassName} mt-3`}>
                끝나는 날 <span className="text-ink-placeholder">(선택)</span>
              </label>
              <DatePickerField
                id="event-repeat-until"
                label="끝나는 날"
                min={getMinDateAfterStart(draft.date)}
                value={draft.repeatUntil}
                openDate={draft.date}
                isClearable
                isDisabled={isSaving}
                isInvalid={Boolean(errors.repeatUntil)}
                describedBy={errors.repeatUntil ? "event-repeat-until-error" : undefined}
                onChange={(date) => updateField("repeatUntil", date)}
                className={inputClassName}
              />
              {errors.repeatUntil && (
                <p id="event-repeat-until-error" className={errorClassName}>
                  {errors.repeatUntil}
                </p>
              )}
            </>
          )}
        </div>

        <div className="flex flex-col">
          <label htmlFor="event-place" className={labelClassName}>
            장소 <span className="text-ink-placeholder">(선택)</span>
          </label>
          <input
            id="event-place"
            value={draft.place}
            maxLength={EVENT_PLACE_MAX_LENGTH * 2}
            disabled={isSaving}
            aria-invalid={Boolean(errors.place)}
            aria-describedby={errors.place ? "event-place-error" : undefined}
            onChange={(event) => updateField("place", event.target.value)}
            className={inputClassName}
          />
          {errors.place && (
            <p id="event-place-error" className={errorClassName}>
              {errors.place}
            </p>
          )}
        </div>

        <div className="flex grow flex-col">
          <label htmlFor="event-memo" className={labelClassName}>
            메모 <span className="text-ink-placeholder">(선택)</span>
          </label>
          <textarea
            id="event-memo"
            value={draft.memo}
            rows={4}
            maxLength={EVENT_MEMO_MAX_LENGTH * 2}
            disabled={isSaving}
            aria-invalid={Boolean(errors.memo)}
            aria-describedby={errors.memo ? "event-memo-error" : undefined}
            onChange={(event) => updateField("memo", event.target.value)}
            className={`${inputClassName} h-auto grow resize-y py-3 leading-[1.5]`}
          />
          {errors.memo && (
            <p id="event-memo-error" className={errorClassName}>
              {errors.memo}
            </p>
          )}
        </div>

        <div className="flex flex-col">
          {notice && (
            <p role="alert" className="mb-3 text-[13px] text-accent">
              {notice}
            </p>
          )}
          <button
            type="submit"
            disabled={isSaving}
            className="press-wide h-[52px] w-full rounded-[10px] bg-accent font-display text-[15px] text-background disabled:opacity-50"
          >
            {isSaving ? "저장 중…" : "저장"}
          </button>
        </div>
      </form>
    </PageShell>
  );
};

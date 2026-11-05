"use client";

import { useRouter } from "next/navigation";
import { startTransition, useState, type ReactElement, type SubmitEvent } from "react";
import { AuthorHeart } from "@/components/AuthorHeart";
import { ConfirmDeleteButton } from "@/components/ConfirmDeleteButton";
import { PageShell } from "@/components/PageShell";
import { ScreenHeader } from "@/components/ScreenHeader";
import { getEventKinds, getHighlightClassNames } from "@/lib/calendar/highlight";
import { toCalendarHref } from "@/lib/calendar/month";
import {
  EVENT_MEMO_MAX_LENGTH,
  EVENT_PLACE_MAX_LENGTH,
  EVENT_TITLE_MAX_LENGTH,
  toEventValues,
  validateEventDraft,
  type EventDraft,
  type EventDraftErrors,
  type EventValues,
} from "@/lib/events/form";
import { clearError } from "@/lib/form";
import { BACK_TRANSITION } from "@/lib/navigation/transition";
import { useLeavableSave, type FailedSave } from "@/lib/navigation/use-leavable-save";
import { createClient } from "@/lib/supabase/client";

const labelClassName = "text-[13px] text-ink-sub";
const inputClassName =
  "mt-2 h-[51px] w-full rounded-[10px] border border-line bg-surface px-4 text-ink placeholder:text-ink-placeholder focus:border-accent focus:outline-none aria-[invalid=true]:border-accent";
const errorClassName = "mt-2 text-[12px] text-accent";
const SAVE_FAILED_MESSAGE = "일정을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.";
const GONE_MESSAGE = "이 일정은 이미 지워졌어요. 캘린더에서 다시 확인해 주세요.";

type TextField = "date" | "startTime" | "title" | "place" | "memo";

const failedSaves = new Map<string, FailedSave<EventDraft>>();

interface EventFormProps {
  initialDraft: EventDraft;
  /** 고칠 일정의 id. 없으면 새 일정을 만든다 */
  eventId?: string;
  /** 고칠 일정의 작성자 닉네임. 있으면 제목 옆에 작성자 하트를 그린다 */
  authorNickname?: string;
  /** 함께 일정이 아닐 때 선택지에 쓰는 닉네임. 새 일정은 현재 사용자, 고칠 일정은 그 작성자다 */
  ownerNickname: string;
}

/** 일정을 저장한다. 실패하면 화면에 보여 줄 문구를, 성공하면 undefined를 돌려준다 */
const saveEvent = async (values: EventValues, eventId: string | undefined): Promise<string | undefined> => {
  const events = createClient().from("events");
  if (!eventId) {
    const { error } = await events.insert(values);
    return error ? SAVE_FAILED_MESSAGE : undefined;
  }
  // 고치는 사이 상대가 지운 일정은 오류 없이 0행이 바뀌므로, 바뀐 행을 받아 확인한다
  const { data, error } = await events.update(values).eq("id", eventId).select("id");
  if (error) return SAVE_FAILED_MESSAGE;
  return data.length === 0 ? GONE_MESSAGE : undefined;
};

/** 공유 캘린더 일정 추가·수정 폼 */
export const EventForm = ({ initialDraft, eventId, authorNickname, ownerNickname }: EventFormProps): ReactElement => {
  const router = useRouter();
  // 캘린더에서 고른 날마다 다른 폼이다. 다른 날의 실패한 내용이 채워지지 않게 날짜까지 구분한다
  const formKey = `event:${eventId ?? `new:${initialDraft.date}`}`;
  const { failedSave, beginSave, finishSaved, finishFailed } = useLeavableSave({ formKey, subject: "일정을", failedSaves });
  const [draft, setDraft] = useState(failedSave?.draft ?? initialDraft);
  const [errors, setErrors] = useState<EventDraftErrors>({});
  const [notice, setNotice] = useState(failedSave?.message);
  const [isSaving, setIsSaving] = useState(false);
  // 캘린더로 돌아가면 일정 날짜가 속한 달을 열고 그날을 고른다
  const backHref = toCalendarHref({ date: initialDraft.date });

  const updateField = (field: TextField, value: string) => {
    setDraft((current) => ({ ...current, [field]: value }));
    setErrors((current) => clearError(current, field));
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
    const failure = await saveEvent(toEventValues(draft), eventId);
    if (failure) {
      setNotice(failure);
      setIsSaving(false);
      finishFailed({ draft, message: failure, isGone: failure === GONE_MESSAGE });
      return;
    }
    finishSaved({
      href: toCalendarHref({ date: draft.date }),
      reset: () => {
        setDraft(initialDraft);
        setIsSaving(false);
      },
    });
  };

  const handleDelete = async () => {
    if (!eventId) return;
    const { error } = await createClient().from("events").delete().eq("id", eventId);
    if (error) throw new Error(`일정을 지우지 못했습니다: ${error.message}`, { cause: error });
    goToCalendar(initialDraft.date);
  };

  return (
    <PageShell
      bottomSpace="sm"
      className="px-4"
      header={
        <ScreenHeader
          back={{ href: backHref, label: "캘린더로" }}
          title={eventId ? "일정 고치기" : "일정 추가"}
          titleAddon={authorNickname && <AuthorHeart nickname={authorNickname} className="ml-2" />}
          actions={
            eventId && (
              <ConfirmDeleteButton
                title="이 일정을 지울까요?"
                description={`"${initialDraft.title}" 일정이 두 사람 캘린더에서 모두 지워져요.`}
                onConfirm={handleDelete}
                failureMessage="일정을 지우지 못했어요. 잠시 후 다시 시도해 주세요."
              />
            )
          }
        />
      }
    >
      {/* 칸이 많아 간격을 좁혀야 메모 4줄이 15 Pro 화면에 들어온다. 남은 높이는 메모 칸이 채워 기기마다 저장 버튼이 같은 자리에 온다(#57) */}
      <form onSubmit={handleSubmit} noValidate className="mt-3 flex flex-1 flex-col gap-4">
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
              <label
                key={highlight}
                className="flex h-[51px] min-w-0 items-center justify-center gap-2 rounded-[10px] border border-line bg-surface px-3 text-[15px] text-ink-sub has-checked:border-accent has-checked:text-ink has-focus-visible:outline-2 has-focus-visible:outline-accent has-disabled:opacity-50"
              >
                <input
                  type="radio"
                  name="event-kind"
                  checked={draft.isTogether === isTogether}
                  disabled={isSaving}
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
            날짜
          </label>
          <input
            id="event-date"
            type="date"
            value={draft.date}
            disabled={isSaving}
            aria-invalid={Boolean(errors.date)}
            aria-describedby={errors.date ? "event-date-error" : undefined}
            onChange={(event) => updateField("date", event.target.value)}
            className={inputClassName}
          />
          {errors.date && (
            <p id="event-date-error" className={errorClassName}>
              {errors.date}
            </p>
          )}
        </div>

        <div className="flex flex-col">
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
            className="h-[52px] w-full rounded-[10px] bg-accent text-[15px] font-bold text-background disabled:opacity-50"
          >
            {isSaving ? "저장 중…" : "저장"}
          </button>
        </div>
      </form>
    </PageShell>
  );
};

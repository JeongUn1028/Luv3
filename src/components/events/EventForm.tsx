"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { startTransition, useState, type ReactElement, type SubmitEvent } from "react";
import { ConfirmDeleteButton } from "@/components/ConfirmDeleteButton";
import { BackIcon } from "@/components/icons";
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
import { createClient } from "@/lib/supabase/client";

const labelClassName = "text-[13px] text-ink-sub";
const inputClassName =
  "mt-2 h-[51px] w-full rounded-[10px] border border-line bg-surface px-4 text-[15px] text-ink placeholder:text-ink-placeholder focus:border-accent focus:outline-none aria-[invalid=true]:border-accent";
const errorClassName = "mt-2 text-[12px] text-accent";
const SAVE_FAILED_MESSAGE = "일정을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.";

type TextField = "date" | "startTime" | "title" | "place" | "memo";

interface EventFormProps {
  initialDraft: EventDraft;
  /** 고칠 일정의 id. 없으면 새 일정을 만든다 */
  eventId?: string;
}

/** 캘린더 페이지로 돌아가는 주소. 일정 날짜가 속한 달을 열고 그날을 고른다 */
const toCalendarHref = (date: string): string => `/?view=calendar&month=${date.slice(0, 7)}&date=${date}`;

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
  return data.length === 0 ? "이 일정은 이미 지워졌어요. 캘린더에서 다시 확인해 주세요." : undefined;
};

/** 공유 캘린더 일정 추가·수정 폼 */
export const EventForm = ({ initialDraft, eventId }: EventFormProps): ReactElement => {
  const router = useRouter();
  const [draft, setDraft] = useState(initialDraft);
  const [errors, setErrors] = useState<EventDraftErrors>({});
  const [notice, setNotice] = useState<string>();
  const [isSaving, setIsSaving] = useState(false);
  const backHref = toCalendarHref(initialDraft.date);

  const updateField = (field: TextField, value: string) => {
    setDraft((current) => ({ ...current, [field]: value }));
    setErrors((current) => clearError(current, field));
  };

  const goToCalendar = (date: string) => {
    startTransition(() => {
      router.replace(toCalendarHref(date));
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

    setNotice(undefined);
    setIsSaving(true);
    const failure = await saveEvent(toEventValues(draft), eventId);
    if (failure) {
      setNotice(failure);
      setIsSaving(false);
      return;
    }
    goToCalendar(draft.date);
  };

  const handleDelete = async () => {
    if (!eventId) return;
    const { error } = await createClient().from("events").delete().eq("id", eventId);
    if (error) throw new Error(`일정을 지우지 못했습니다: ${error.message}`, { cause: error });
    goToCalendar(initialDraft.date);
  };

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[430px] flex-col px-4 pb-[max(24px,env(safe-area-inset-bottom))]">
      <header className="-mx-2 flex shrink-0 items-center justify-between pt-[env(safe-area-inset-top)]">
        <div className="flex items-center">
          <Link
            href={backHref}
            aria-label="캘린더로"
            className="flex size-11 items-center justify-center text-ink-sub hover:text-ink"
          >
            <BackIcon className="size-[22px]" />
          </Link>
          <h1 className="text-[17px] text-ink">{eventId ? "일정 고치기" : "일정 추가"}</h1>
        </div>
        {eventId && (
          <ConfirmDeleteButton
            title="이 일정을 지울까요?"
            description={`"${initialDraft.title}" 일정이 두 사람 캘린더에서 모두 지워져요.`}
            onConfirm={handleDelete}
            failureMessage="일정을 지우지 못했어요. 잠시 후 다시 시도해 주세요."
          />
        )}
      </header>

      <form onSubmit={handleSubmit} noValidate className="mt-6 flex flex-col gap-6">
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

        <div className="flex flex-col">
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
            className={`${inputClassName} h-auto resize-y py-3 leading-[1.6]`}
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
    </main>
  );
};

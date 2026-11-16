"use client";

import { useState, type ReactElement } from "react";
import { ConfirmDeleteButton } from "@/components/ConfirmDeleteButton";
import { EventRecordAction } from "@/components/events/EventRecordAction";
import { toKstDate } from "@/lib/anniversary";
import { isCalendarMonthUrl, toCalendarHref } from "@/lib/calendar/month";
import { DELETING_KEYS } from "@/lib/deleting";
import { toEventDeleteDialog } from "@/lib/events/delete-dialog";
import type { EventDraft } from "@/lib/events/form";
import type { EventRecordLink } from "@/lib/events/record-link";
import { deleteEvent } from "@/lib/events/save";
import { createClient } from "@/lib/supabase/client";

interface EventFormActionsProps {
  eventId: string;
  /** 삭제 실패 알림을 폼마다 구분하는 열쇠 */
  formKey: string;
  /** 고치기 화면을 열 때의 내용. 삭제 확인 문구에 쓴다 */
  initialDraft: EventDraft;
  /** 반복 중 하루만 지울 때 그날. 없으면 일정 전체를 지운다 */
  deleteOccurrenceDate: string | undefined;
  /** 지운 뒤 돌아갈 캘린더에서 고를 날 */
  backDate: string;
  /** 고치는 날에 남긴 기록으로 가거나 그날로 기록을 남기는 버튼(#227). 없으면 버튼을 그리지 않는다 */
  recordLink: EventRecordLink | undefined;
}

/**
 * 일정 고치기 화면 머리글의 버튼: 기록 잇기·보기와 지우기.
 *
 * @example <EventFormActions eventId={eventId} formKey={formKey} initialDraft={initialDraft} deleteOccurrenceDate={undefined} backDate={backDate} recordLink={recordLink} />
 */
export const EventFormActions = ({
  eventId,
  formKey,
  initialDraft,
  deleteOccurrenceDate,
  backDate,
  recordLink,
}: EventFormActionsProps): ReactElement => {
  // 이미 쓴 기록을 이으면 화면을 새로 받지 않고 버튼만 바꾼다. 새로 받으면 폼을 새로 그려 고치던 내용이 사라진다(#237)
  const [linkedRecordId, setLinkedRecordId] = useState<string>();
  const shownRecordLink: EventRecordLink | undefined = linkedRecordId ? { kind: "view", recordId: linkedRecordId } : recordLink;

  const backHref = toCalendarHref({ date: backDate });

  const handleDelete = async () => {
    const supabase = createClient();
    await deleteEvent({ events: supabase.from("events"), exceptions: supabase.from("event_exceptions"), eventId, occurrenceDate: deleteOccurrenceDate });
  };

  return (
    <>
      {shownRecordLink && (
        <EventRecordAction
          eventId={eventId}
          link={shownRecordLink}
          onLinked={setLinkedRecordId}
          className="press-icon flex h-11 shrink-0 items-center px-3 text-[14px] text-ink-sub hover:text-ink"
        />
      )}
      <ConfirmDeleteButton
        {...toEventDeleteDialog(initialDraft, deleteOccurrenceDate)}
        subject="일정을"
        noticeKey={`delete:${formKey}`}
        onConfirm={handleDelete}
        returnTo={backHref}
        canGoBackTo={(url) => isCalendarMonthUrl(url, backDate.slice(0, 7), toKstDate(new Date()))}
        deletingKey={DELETING_KEYS.event(eventId, deleteOccurrenceDate)}
        failureMessage="일정을 지우지 못했어요. 잠시 후 다시 시도해 주세요."
      />
    </>
  );
};

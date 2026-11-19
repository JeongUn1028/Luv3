"use client";

import { useState, type Dispatch, type SetStateAction } from "react";
import { toKstDate } from "@/lib/anniversary";
import { isCalendarMonthUrl, toCalendarHref } from "@/lib/calendar/month";
import { deletingStore, toEventDayPrefix } from "@/lib/deleting";
import { getDateAfterSave } from "@/lib/events/edit-scope";
import type { EventDraft } from "@/lib/events/form";
import { canShowEventBeforeSave, pendingEventStore, toPendingCalendarEvent } from "@/lib/events/pending";
import { EVENT_NOT_SENT_FAILURE, saveEvent } from "@/lib/events/save";
import type { LeavableSave } from "@/lib/navigation/use-leavable-save";
import { requestPartnerPush } from "@/lib/push/request-partner-push";
import { toFailedSaveFields } from "@/lib/revision";
import { withLoadedClient } from "@/lib/supabase/load-client";
import { requestTodoFocus } from "@/lib/todos/focus";
import { TODOS_PATH } from "@/lib/todos/list";

interface UseEventSaveParams {
  initialDraft: EventDraft;
  /** 고칠 일정의 id. 없으면 새 일정을 만든다 */
  eventId: string | undefined;
  /** 캘린더에 먼저 그릴 때 쓰는 작성자 닉네임. 새 일정은 현재 사용자, 고칠 일정은 그 작성자다 */
  pendingAuthorNickname: string | undefined;
  /** 반복 일정의 어느 날을 눌렀는지 */
  occurrence: { date: string; startDate: string } | undefined;
  /** 기간 일정의 어느 날을 눌렀는지 */
  viewedDate: string | undefined;
  /** 뒤로 가면 고를 날. 저장할 날이 이 날이면 뒤로 가서 숨겨 둔 캘린더를 그대로 보여 준다 */
  backDate: string;
  /** 새 일정을 이 하고 싶은 것에 이어 만든다(#471). 저장하면 하고 싶은 것 목록으로 돌아가 그 줄을 보여 준다 */
  todoId: string | undefined;
  setDraft: Dispatch<SetStateAction<EventDraft>>;
  /** 폼 아래 안내. 저장을 시작하면 지우고 실패하면 이유를 적는다 */
  setNotice: Dispatch<SetStateAction<string | undefined>>;
  /** 저장하는 동안 폼을 떠나도 결과를 알리는 저장(#104) */
  leavableSave: Pick<LeavableSave<EventDraft>, "beginSave" | "finishSaved" | "finishFailed">;
}

interface SaveEventParams {
  /** 검사를 마친 입력값 */
  draft: EventDraft;
  /** 저장한 뒤 폼을 처음 상태로 되돌린다 */
  reset: () => void;
}

interface EventSave {
  isSaving: boolean;
  save: (params: SaveEventParams) => Promise<void>;
}

/**
 * 일정 폼의 저장 흐름: 저장을 기다리지 않고 캘린더로 돌아가고, 하루짜리 일정은 캘린더에 먼저 그린다(#345).
 * 실패하면 다음 시도에 필요한 id·판 번호를 기억하고, 새 일정이면 상대에게 알린다(#364).
 *
 * @example const eventSave = useEventSave({ initialDraft, eventId, pendingAuthorNickname, occurrence, viewedDate, backDate, setDraft, setNotice, leavableSave }); await eventSave.save({ draft, reset })
 */
export const useEventSave = ({
  initialDraft,
  eventId,
  pendingAuthorNickname,
  occurrence,
  viewedDate,
  backDate,
  todoId,
  setDraft,
  setNotice,
  leavableSave,
}: UseEventSaveParams): EventSave => {
  const { beginSave, finishSaved, finishFailed } = leavableSave;
  const [isSaving, setIsSaving] = useState(false);

  const save = async ({ draft, reset }: SaveEventParams) => {
    setNotice(undefined);
    setIsSaving(true);
    // 반복을 바꾸면 하루씩 지웠던 날이 다시 생길 수 있다. 지운 지 오래라 캘린더도 이미 새로 받았으므로 숨김을 푼다(#346)
    if (eventId) deletingStore.restoreStartingWith(toEventDayPrefix(eventId));
    const newEventId = draft.newEventId ?? crypto.randomUUID();
    // 시도마다 새 판 번호를 쓴다. 내용이 바뀌면 판 번호도 바뀌어야 열어 둔 상대의 화면이 알아챈다
    const revision = crypto.randomUUID();
    const dateAfterSave = getDateAfterSave(draft, { occurrenceDate: occurrence?.date, viewedDate });
    // 하고 싶은 것에서 연 폼은 목록으로 돌아가 그 줄을 보여 주고, 저장이 끝나면 그 줄에 날짜 칩이 붙는다.
    // 고치기 화면(폼)으로 돌아가면 쓰던 내용을 지키려고 새로 받지 않아 "일정 잡기"가 그대로 남는다
    const savedHref = todoId ? TODOS_PATH : toCalendarHref({ date: dateAfterSave });
    // 하루짜리 일정만 저장을 기다리지 않고 캘린더에 먼저 그린다. 반복·기간·"이 날만 고치기"는 저장이 끝난 뒤 새로 받는다(#345)
    const pendingId = eventId ?? newEventId;
    const isShownBeforeSave = canShowEventBeforeSave({ draft, initialDraft });
    if (isShownBeforeSave) {
      pendingEventStore.add({
        id: pendingId,
        event: toPendingCalendarEvent({ id: pendingId, draft, authorNickname: pendingAuthorNickname }),
        revision,
        // 응답만 끊겨 다시 저장하는 새 일정은 앞 시도가 저장됐을 수 있어 고치기로 다룬다. 서버에 그 id가 들어와도 이번 내용이 따라잡을 때까지 덮는다
        previousRevisions: draft.expectedRevisions ?? [],
        isNew: !eventId && draft.newEventId === undefined,
      });
    }
    // 저장을 기다리지 않고 캘린더로 돌아간다. 앞 화면이 같은 달을 보던 캘린더이고 폼을 연 그날로 돌아가면 뒤로 가서 숨겨 둔 캘린더를 그대로 보여 주고,
    // 저장할 날이 다른 날·다른 달이면 그날을 고른 캘린더 주소로 옮긴다
    const hasReturned = beginSave({
      returnTo: savedHref,
      canGoBackTo: (url) =>
        todoId ? url.pathname === savedHref : dateAfterSave === backDate && isCalendarMonthUrl(url, dateAfterSave.slice(0, 7), toKstDate(new Date())),
    });
    // 인터넷이 끊겨 폼에 남으면 캘린더에 먼저 그릴 일이 없다(저장은 실패한다)
    if (!hasReturned) pendingEventStore.discard(pendingId, revision);
    // 목록으로 돌아갈 때만 그 줄을 남긴다. 폼에 남았는데 남기면 나중에 목록을 열 때 엉뚱하게 그 줄로 간다.
    // 목록은 다음 그림에서 꺼내므로 옮기기를 시작한 뒤에 남겨도 된다
    else if (todoId) requestTodoFocus(todoId);
    const failure = await withLoadedClient({
      request: (supabase) =>
        saveEvent({
          events: supabase.from("events"),
          detachOccurrence: (args) => supabase.rpc("detach_event_occurrence", args),
          todoSchedule: todoId ? { todoId, scheduleTodo: (args) => supabase.rpc("schedule_todo", args) } : undefined,
          draft,
          eventId,
          occurrenceDate: occurrence?.date,
          newEventId,
          revision,
        }),
      onLoadFailed: () => EVENT_NOT_SENT_FAILURE,
    });
    if (failure) {
      pendingEventStore.discard(pendingId, revision);
      const failedFields = {
        // 앞선 시도가 저장됐을 수 있으므로 다시 저장할 때 같은 id를 쓴다(이 날만 고치면 따로 나올 일정의 id)
        newEventId,
        ...toFailedSaveFields({ failure, expectedRevisions: draft.expectedRevisions, revision }),
      };
      setDraft((current) => ({ ...current, ...failedFields }));
      setNotice(failure.message);
      setIsSaving(false);
      finishFailed({ draft: { ...draft, ...failedFields }, ...failure });
      return;
    }
    // 새로 추가한 일정만 알린다. 고친 일정과 "이 날만 고치기"로 따로 나온 일정은 알리지 않는다(#364)
    if (!eventId) requestPartnerPush({ kind: "event", id: newEventId });
    if (isShownBeforeSave) pendingEventStore.markSaved(pendingId, revision);
    finishSaved({
      href: savedHref,
      reset: () => {
        reset();
        setIsSaving(false);
      },
    });
  };

  return { isSaving, save };
};

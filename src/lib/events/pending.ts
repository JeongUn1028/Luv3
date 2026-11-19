import { createPendingSaveStore, findSettledIds, isBeforeSave, type PendingSave } from "@/lib/pending-saves";
import type { CalendarEvent } from "./calendar";
import type { EventDraft } from "./form";

/**
 * 저장을 기다리는 일정(#345). 저장을 누르자마자 캘린더로 돌아가므로, 서버 목록이 따라잡을 때까지 캘린더에 먼저 그린다.
 * 하루짜리 일정만 담는다. 반복·기간은 펼치는 계산이 필요해 저장이 끝난 뒤 새로 받아 나타난다(사용자 결정).
 *
 * @example const pending: PendingEvent = { id, event, revision, previousRevisions: [], isNew: true, isSaved: false };
 */
export interface PendingEvent extends PendingSave {
  /** 먼저 그릴 일정 한 줄 */
  event: CalendarEvent;
}

/**
 * 캘린더에 그리는 일정. 저장 중이면 흐리게 그리고, 아직 서버에 없을 수 있어 누를 수 없게 한다.
 *
 * @example const shown: ShownEvent = { ...event, isPending: true };
 */
export interface ShownEvent extends CalendarEvent {
  /** 폼에서 저장 중인지 */
  isPending?: boolean;
}

const isOneDayDraft = ({ repeatRule, endDate }: Pick<EventDraft, "repeatRule" | "endDate">): boolean => repeatRule === undefined && endDate === undefined;

/**
 * 저장 전에 캘린더에 먼저 그릴 수 있는 저장인지. 저장할 일정과 고치기 전 일정이 모두 하루짜리여야 한다.
 * 고치기 전이 반복·기간이면 캘린더에 여러 날 그려져 있어, 저장이 끝나 새로 받기 전까지 어느 날을 지울지 알 수 없다.
 * "이 날만 고치기"는 반복 일정에서만 나오므로 함께 빠진다.
 *
 * @example canShowEventBeforeSave({ draft, initialDraft }) // true면 먼저 그린다
 */
export const canShowEventBeforeSave = ({ draft, initialDraft }: { draft: EventDraft; initialDraft: EventDraft }): boolean =>
  isOneDayDraft(draft) && isOneDayDraft(initialDraft);

/**
 * 저장할 폼 내용을 캘린더 줄로 바꾼다. 값은 저장할 때(`toEventValues`)와 같게 다듬는다.
 *
 * @example toPendingCalendarEvent({ id, draft, authorNickname: "정운" })
 */
export const toPendingCalendarEvent = ({
  id,
  draft,
  authorNickname,
}: {
  id: string;
  draft: EventDraft;
  /** 작성자 닉네임. 새 일정은 나, 고치는 일정은 그 작성자 */
  authorNickname: string | undefined;
}): CalendarEvent => ({
  id,
  date: draft.date,
  repeatRule: undefined,
  period: undefined,
  // DB의 time은 HH:MM:SS로 돌아온다. 같은 모양이어야 정렬과 시간 표기가 서버 값과 같다
  startTime: draft.isAllDay ? null : `${draft.startTime}:00`,
  title: draft.title.trim(),
  place: draft.place.trim() || undefined,
  isTogether: draft.isTogether,
  authorNickname,
});

// 서버와 같은 날짜 → 종일 먼저 → 시간 순서. 정렬이 안정적이라 같은 자리에서는 서버 순서를 지키고 새로 그린 줄은 뒤에 온다
const toSortKey = ({ date, startTime }: CalendarEvent): string => `${date} ${startTime ?? ""}`;

/**
 * 서버 목록에 저장 중인 일정을 합친다.
 * - 고치는 중인 일정은 서버 목록이 아직 저장 전 판이면 서버의 줄 자리에 저장 중인 내용을 그린다(날짜·시간을 바꿨으면 새 자리로 옮긴다)
 * - 새 일정은 서버 목록에 그 id가 없으면 그린다
 * - 서버 목록이 따라잡았으면 서버 목록 그대로 그린다
 *
 * @example const shown = mergePendingEvents(events, pendingEventStore.getPending());
 */
export const mergePendingEvents = (events: CalendarEvent[], pendingEvents: readonly PendingEvent[]): ShownEvent[] => {
  if (pendingEvents.length === 0) return events;
  const pendingById = new Map(pendingEvents.map((pending) => [pending.id, pending]));
  const serverIds = new Set<string>();
  const shown: ShownEvent[] = events.map((event) => {
    serverIds.add(event.id);
    const pending = pendingById.get(event.id);
    // 하루짜리만 먼저 그리므로 서버의 줄도 하나다. 이어진 기록과 하고 싶은 것(#471)은 폼이 바꾸지 않아 서버 값을 지킨다
    return pending && isBeforeSave(event.revision, pending)
      ? { ...pending.event, recordId: event.recordId, ...(event.todo ? { todo: event.todo } : {}), isPending: true }
      : event;
  });
  for (const pending of pendingEvents) {
    // 서버에 없는 고치기는 다른 달에 있던 일정을 이 달로 옮기는 중일 수 있다. 저장이 끝났는데도 없으면 그사이 지워진 것이다
    if (!serverIds.has(pending.id) && (pending.isNew || !pending.isSaved)) shown.push({ ...pending.event, isPending: true });
  }
  return shown.toSorted((left, right) => toSortKey(left).localeCompare(toSortKey(right)));
};

/**
 * 서버 목록이 따라잡아 더는 먼저 그릴 필요가 없는 저장 중인 일정의 id.
 *
 * @example pendingEventStore.remove(findSettledPendingEventIds(events, pendingEvents));
 */
export const findSettledPendingEventIds = (events: CalendarEvent[], pendingEvents: readonly PendingEvent[]): string[] =>
  findSettledIds(new Map(events.map(({ id, revision }) => [id, revision])), pendingEvents);

/** 앱 전체에서 하나만 쓰는 저장 중인 일정 보관함 */
export const pendingEventStore = createPendingSaveStore<PendingEvent>();

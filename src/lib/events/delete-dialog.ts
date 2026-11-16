import { formatDayHeading } from "@/lib/calendar/month";
import type { EventDraft } from "./form";
import { formatEventPeriod } from "./recurrence";

/**
 * 일정 삭제 확인 창의 문구. 반복 중 하루, 반복 전체, 기간, 하루 일정마다 무엇이 지워지는지 다르게 알린다.
 *
 * @example toEventDeleteDialog(initialDraft, "2026-11-09") // { title: "이 날 일정을 지울까요?", description: "..." }
 */
export const toEventDeleteDialog = (
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

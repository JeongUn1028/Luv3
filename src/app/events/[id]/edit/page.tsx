import type { Metadata } from "next";
import { EventForm } from "@/components/events/EventForm";
import { FormSkeleton } from "@/components/FormSkeleton";
import { LoadErrorScreen } from "@/components/LoadErrorScreen";
import { StatusLink, StatusScreen } from "@/components/StatusScreen";
import { LoadingSuspense } from "@/components/LoadingSuspense";
import { toKstDate } from "@/lib/anniversary";
import { getCurrentMember } from "@/lib/auth/member";
import { CALENDAR_PATH } from "@/lib/calendar/month";
import { isRepeatRule, toOwnerLabel } from "@/lib/events/calendar";
import { findViewedPeriodDate, toEventDraft } from "@/lib/events/form";
import { EventLoadError, getEvent } from "@/lib/events/queries";
import { getEditEventRecordLink } from "@/lib/events/record-link";
import { findOccurrenceDate } from "@/lib/events/recurrence";
import { catchLoadError } from "@/lib/load";

export const metadata: Metadata = { title: "일정 고치기 · Luv3" };

const EditEventForm = async ({ params, searchParams }: Pick<PageProps<"/events/[id]/edit">, "params" | "searchParams">) => {
  // 허용목록 밖 계정은 여기서 로그아웃 처리 경로로 보낸다
  await getCurrentMember();
  const { id } = await params;
  const { date } = await searchParams;

  const event = await catchLoadError(() => getEvent(id), EventLoadError);

  if (event instanceof EventLoadError) {
    return <LoadErrorScreen title="일정을 불러오지 못했어요" backHref={CALENDAR_PATH} backLabel="캘린더로" />;
  }

  if (!event) {
    return (
      <StatusScreen title="일정을 찾을 수 없어요" description="지워졌거나 주소가 잘못됐어요.">
        <StatusLink href={CALENDAR_PATH}>캘린더로</StatusLink>
      </StatusScreen>
    );
  }

  // 캘린더에서 누른 날이 오는 날이면 그날을 고칠지 전체를 고칠지 고르게 한다
  const occurrenceDate = findOccurrenceDate(event, date);

  // 낡은 캘린더에서 이미 고치거나 지운 날을 누른 경우다. 그대로 열면 그날만 고치려다 반복 전체를 고치게 된다
  if (isRepeatRule(event.repeat_rule) && date !== undefined && !occurrenceDate) {
    return (
      <StatusScreen title="이 날 일정은 이미 고쳤거나 지웠어요" description="캘린더에서 다시 확인해 주세요.">
        <StatusLink href={CALENDAR_PATH}>캘린더로</StatusLink>
      </StatusScreen>
    );
  }

  // cacheComponents는 다녀온 화면의 상태를 보존해, 다시 열면 예전 입력값이 남는다. 요청마다 새 key로 최신 값을 채운다
  return (
    <EventForm
      key={crypto.randomUUID()}
      eventId={event.id}
      authorNickname={event.authorNickname}
      ownerNickname={toOwnerLabel(event.authorNickname)}
      initialDraft={{ ...toEventDraft(event, occurrenceDate), expectedRevisions: [event.revision] }}
      occurrence={occurrenceDate ? { date: occurrenceDate, startDate: event.date } : undefined}
      viewedDate={findViewedPeriodDate(event, date)}
      isDetached={event.repeat_parent_id !== null}
      recordLink={getEditEventRecordLink(event, occurrenceDate, toKstDate(new Date()))}
    />
  );
};

const EditEventPage = ({ params, searchParams }: PageProps<"/events/[id]/edit">) => (
  // 주소의 id·쿼리와 세션은 요청 때만 알 수 있어 Suspense 안에서 읽는다(cacheComponents)
  <LoadingSuspense fallback={<FormSkeleton back={{ href: CALENDAR_PATH }} title="일정 고치기" fieldCount={5} />}>
    <EditEventForm params={params} searchParams={searchParams} />
  </LoadingSuspense>
);

export default EditEventPage;

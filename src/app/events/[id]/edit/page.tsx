import type { Metadata } from "next";
import { EventForm } from "@/components/events/EventForm";
import { FormSkeleton } from "@/components/FormSkeleton";
import { PageShell } from "@/components/PageShell";
import { StatusLink, StatusScreen } from "@/components/StatusScreen";
import { LoadingSuspense } from "@/components/LoadingSuspense";
import { getCurrentMember } from "@/lib/auth/member";
import { CALENDAR_PATH } from "@/lib/calendar/month";
import { toOwnerLabel } from "@/lib/events/calendar";
import { toEventDraft } from "@/lib/events/form";
import { EventLoadError, getEvent } from "@/lib/events/queries";

export const metadata: Metadata = { title: "일정 고치기 · Luv3" };

const EditEventForm = async ({ params }: { params: Promise<{ id: string }> }) => {
  // 허용목록 밖 계정은 여기서 로그아웃 처리 경로로 보낸다
  await getCurrentMember();
  const { id } = await params;

  let event: Awaited<ReturnType<typeof getEvent>>;
  try {
    event = await getEvent(id);
  } catch (error) {
    if (!(error instanceof EventLoadError)) throw error;
    return (
      <PageShell className="items-center justify-center px-4">
        <p role="alert" className="text-[13px] text-ink-sub">
          {error.message}
        </p>
      </PageShell>
    );
  }

  if (!event) {
    return (
      <StatusScreen title="일정을 찾을 수 없어요" description="지워졌거나 주소가 잘못됐어요.">
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
      initialDraft={toEventDraft(event)}
    />
  );
};

const EditEventPage = ({ params }: PageProps<"/events/[id]/edit">) => (
  // 주소의 id와 세션은 요청 때만 알 수 있어 Suspense 안에서 읽는다(cacheComponents)
  <LoadingSuspense fallback={<FormSkeleton back={{ href: CALENDAR_PATH, label: "캘린더로" }} title="일정 고치기" fieldCount={5} />}>
    <EditEventForm params={params} />
  </LoadingSuspense>
);

export default EditEventPage;

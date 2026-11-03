import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { EventForm } from "@/components/events/EventForm";
import { getCurrentMember } from "@/lib/auth/member";
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
      <main className="mx-auto flex min-h-full w-full max-w-[430px] items-center justify-center px-4">
        <p role="alert" className="text-[13px] text-ink-sub">
          {error.message}
        </p>
      </main>
    );
  }

  if (!event) {
    return (
      <main className="mx-auto flex min-h-full w-full max-w-[430px] flex-col items-center justify-center gap-4 px-4 text-center">
        <p className="text-[15px] text-ink">일정을 찾을 수 없어요</p>
        <p className="text-[13px] text-ink-sub">지워졌거나 주소가 잘못됐어요.</p>
        <Link
          href="/?view=calendar"
          className="mt-2 flex h-[51px] w-full items-center justify-center rounded-[10px] border border-line text-[15px] text-ink hover:bg-surface"
        >
          캘린더로
        </Link>
      </main>
    );
  }

  // cacheComponents는 다녀온 화면의 상태를 보존해, 다시 열면 예전 입력값이 남는다. 요청마다 새 key로 최신 값을 채운다
  return (
    <EventForm
      key={crypto.randomUUID()}
      eventId={event.id}
      authorNickname={event.authorNickname}
      initialDraft={toEventDraft(event)}
    />
  );
};

const EditEventPage = ({ params }: PageProps<"/events/[id]/edit">) => (
  // 주소의 id와 세션은 요청 때만 알 수 있어 Suspense 안에서 읽는다(cacheComponents)
  <Suspense fallback={<div className="min-h-full" />}>
    <EditEventForm params={params} />
  </Suspense>
);

export default EditEventPage;

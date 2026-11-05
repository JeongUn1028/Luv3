import type { Metadata } from "next";
import { EventForm } from "@/components/events/EventForm";
import { FormSkeleton } from "@/components/FormSkeleton";
import { LoadingSuspense } from "@/components/LoadingSuspense";
import { toKstDate } from "@/lib/anniversary";
import { getCurrentMember } from "@/lib/auth/member";
import { CALENDAR_PATH } from "@/lib/calendar/month";
import { createEmptyEventDraft } from "@/lib/events/form";
import { isIsoDate } from "@/lib/form";

export const metadata: Metadata = { title: "일정 추가 · Luv3" };

const NewEventForm = async ({ searchParams }: Pick<PageProps<"/events/new">, "searchParams">) => {
  // 허용목록 밖 계정은 여기서 로그아웃 처리 경로로 보낸다
  const { nickname } = await getCurrentMember();
  const { date } = await searchParams;
  // 캘린더에서 고른 날을 기본값으로, 없거나 틀리면 오늘(한국 날짜)
  const initialDate = typeof date === "string" && isIsoDate(date) ? date : toKstDate(new Date());

  // cacheComponents는 다녀온 화면의 상태를 보존해, 다시 열면 예전 입력값이 남는다. 요청마다 새 key로 새 폼을 만든다
  return <EventForm key={crypto.randomUUID()} initialDraft={createEmptyEventDraft(initialDate)} ownerNickname={nickname} />;
};

const NewEventPage = ({ searchParams }: PageProps<"/events/new">) => (
  // 세션·주소 쿼리는 요청 때만 알 수 있어 Suspense 안에서 읽는다(cacheComponents)
  <LoadingSuspense fallback={<FormSkeleton back={{ href: CALENDAR_PATH }} title="일정 추가" fieldCount={5} />}>
    <NewEventForm searchParams={searchParams} />
  </LoadingSuspense>
);

export default NewEventPage;

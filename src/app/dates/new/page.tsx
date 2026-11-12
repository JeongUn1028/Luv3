import type { Metadata } from "next";
import { DateRecordForm } from "@/components/dates/DateRecordForm";
import { FormSkeleton } from "@/components/FormSkeleton";
import { LoadErrorScreen } from "@/components/LoadErrorScreen";
import { LoadingSuspense } from "@/components/LoadingSuspense";
import { toKstDate } from "@/lib/anniversary";
import { getCurrentMember } from "@/lib/auth/member";
import { CALENDAR_PATH } from "@/lib/calendar/month";
import { RECORDS_PATH } from "@/lib/dates/album";
import { parseRecordPrefill } from "@/lib/dates/form";
import { getTagSuggestions } from "@/lib/dates/queries";
import { EventLoadError, getEventRecordPrefill } from "@/lib/events/queries";
import { catchLoadError } from "@/lib/load";

export const metadata: Metadata = { title: "기록 남기기 · Luv3" };

const MemberOnlyForm = async ({ searchParams }: Pick<PageProps<"/dates/new">, "searchParams">) => {
  // 허용목록 밖 계정은 여기서 로그아웃 처리 경로로 보낸다
  await getCurrentMember();
  const params = await searchParams;
  const today = toKstDate(new Date());
  const { event: eventId, eventDate } = params;
  // 캘린더의 지난 일정에서 넘어오면 일정을 읽어 날짜·제목·메모를 채우고 그 일정과 잇는다(#227).
  // 없는 일정이거나 그날로 남길 수 없으면 연결 없이 쓴다. 예전 주소(날짜·제목 쿼리)도 그대로 받는다
  const [eventPrefill, tagSuggestions] = await Promise.all([
    typeof eventId === "string" && typeof eventDate === "string"
      ? catchLoadError(() => getEventRecordPrefill({ eventId, eventDate }, today), EventLoadError)
      : undefined,
    getTagSuggestions(),
  ]);
  if (eventPrefill instanceof EventLoadError) {
    return <LoadErrorScreen title="일정을 불러오지 못했어요" backHref={CALENDAR_PATH} backLabel="캘린더로" />;
  }
  const prefill = eventPrefill ?? parseRecordPrefill(params, today);
  // cacheComponents는 다녀온 화면의 상태를 보존한다. 일정에서 넘어오면 요청마다 새 key로 그 일정 값을 다시 채우고
  // (일정 수정 화면과 같은 방식), 그냥 열면 같은 key로 쓰던 내용을 남긴다. 둘을 오가면 key가 바뀌어 쓰던 내용은 사라진다
  return (
    <DateRecordForm
      key={prefill ? crypto.randomUUID() : "empty"}
      prefill={prefill}
      tagSuggestions={tagSuggestions}
    />
  );
};

const NewDateRecordPage = ({ searchParams }: PageProps<"/dates/new">) => (
  // 세션·주소 쿼리를 읽고 오늘 날짜를 기본값으로 쓰므로 요청 시점에 렌더링한다(cacheComponents)
  <LoadingSuspense fallback={<FormSkeleton back={{ href: RECORDS_PATH }} title="기록 남기기" fieldCount={4} />}>
    <MemberOnlyForm searchParams={searchParams} />
  </LoadingSuspense>
);

export default NewDateRecordPage;
